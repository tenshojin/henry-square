# 用本地 ComfyUI（D:\ComfyUI，http://127.0.0.1:8188）跑 AI 图像 / 视频生成：
#   qwen_edit  —— Qwen-Image-Edit-2511（GGUF 4 位 + 4 步加速 LoRA）：拿一张图做底，按文字和参考图改（把设定图里的人放进场景）
#   wan_flf2v  —— Wan 2.2 图生视频 14B（GGUF 4 位 + 4 步加速 LoRA）：给第一帧和最后一帧，生成中间的动画（16 帧/秒）
# 输入图片放进 ComfyUI 的 input 文件夹，结果从 output 文件夹取回。
import json, os, shutil, time, uuid, urllib.request, urllib.parse

HOST = 'http://127.0.0.1:8188'
COMFY = r'D:\ComfyUI\app'
NEG_WAN = '色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走，两个人，重复的人物，分身，克隆，两个一样的人'


def put(path, name=None):
    """把图片拷进 ComfyUI 的 input 文件夹，返回文件名。"""
    name = name or os.path.basename(path)
    shutil.copy(path, os.path.join(COMFY, 'input', name))
    return name


def run(wf, timeout=3600):
    """提交工作流，等它跑完，返回输出文件（ComfyUI output 文件夹里的绝对路径）列表。"""
    body = json.dumps({'prompt': wf, 'client_id': str(uuid.uuid4())}).encode()
    req = urllib.request.Request(HOST + '/prompt', data=body, headers={'Content-Type': 'application/json'})
    try:
        pid = json.loads(urllib.request.urlopen(req).read())['prompt_id']
    except urllib.error.HTTPError as e:
        raise RuntimeError(e.read().decode()[:3000])
    t0 = time.time()
    while time.time() - t0 < timeout:
        time.sleep(2)
        h = json.loads(urllib.request.urlopen(HOST + '/history/' + pid).read())
        if pid not in h:
            continue
        st = h[pid].get('status', {})
        if st.get('status_str') == 'error':
            raise RuntimeError(json.dumps(st.get('messages', []))[:3000])
        if not st.get('completed'):
            continue
        out = []
        for node in h[pid]['outputs'].values():
            for img in node.get('images', []):
                out.append(os.path.join(COMFY, 'output', img.get('subfolder', ''), img['filename']))
        return out
    raise TimeoutError(pid)


def qwen_edit(image1, prompt, refs=(), seed=1, prefix='edit', steps=4):
    """image1 做底（输出的构图和大小跟它走），refs 是参考图（最多 2 张）。"""
    wf = {
        '1': {'class_type': 'UnetLoaderGGUF', 'inputs': {'unet_name': 'qwen_image_edit_2511_Q4_K_M.gguf'}},
        '2': {'class_type': 'ModelSamplingAuraFlow', 'inputs': {'model': ['1', 0], 'shift': 3.1}},
        '3': {'class_type': 'CFGNorm', 'inputs': {'model': ['2', 0], 'strength': 1.0}},
        '4': {'class_type': 'LoraLoaderModelOnly', 'inputs': {'model': ['3', 0], 'lora_name': 'qwen_edit_2511_lightning_4steps.safetensors', 'strength_model': 1.0}},
        '5': {'class_type': 'CLIPLoader', 'inputs': {'clip_name': 'qwen_2.5_vl_7b_fp8_scaled.safetensors', 'type': 'qwen_image', 'device': 'default'}},
        '6': {'class_type': 'VAELoader', 'inputs': {'vae_name': 'qwen_image_vae.safetensors'}},
        '7': {'class_type': 'LoadImage', 'inputs': {'image': image1}},
        '8': {'class_type': 'FluxKontextImageScale', 'inputs': {'image': ['7', 0]}},
        '9': {'class_type': 'VAEEncode', 'inputs': {'pixels': ['8', 0], 'vae': ['6', 0]}},
    }
    enc = {'clip': ['5', 0], 'vae': ['6', 0], 'image1': ['8', 0]}
    for i, r in enumerate(refs[:2]):
        nid = str(20 + i)
        wf[nid] = {'class_type': 'LoadImage', 'inputs': {'image': r}}
        enc['image%d' % (i + 2)] = [nid, 0]
    wf['12'] = {'class_type': 'TextEncodeQwenImageEditPlus', 'inputs': dict(enc, prompt=prompt)}
    wf['13'] = {'class_type': 'TextEncodeQwenImageEditPlus', 'inputs': dict(enc, prompt='')}
    wf['14'] = {'class_type': 'FluxKontextMultiReferenceLatentMethod', 'inputs': {'conditioning': ['12', 0], 'reference_latents_method': 'index_timestep_zero'}}
    wf['15'] = {'class_type': 'FluxKontextMultiReferenceLatentMethod', 'inputs': {'conditioning': ['13', 0], 'reference_latents_method': 'index_timestep_zero'}}
    wf['16'] = {'class_type': 'KSampler', 'inputs': {'model': ['4', 0], 'positive': ['14', 0], 'negative': ['15', 0], 'latent_image': ['9', 0],
                                                    'seed': seed, 'steps': steps, 'cfg': 1.0, 'sampler_name': 'euler', 'scheduler': 'simple', 'denoise': 1.0}}
    wf['17'] = {'class_type': 'VAEDecode', 'inputs': {'samples': ['16', 0], 'vae': ['6', 0]}}
    wf['18'] = {'class_type': 'SaveImage', 'inputs': {'images': ['17', 0], 'filename_prefix': prefix}}
    return run(wf)


def wan_flf2v(start, end, prompt, width=960, height=480, length=81, seed=1, prefix='clip', neg=NEG_WAN):
    """首帧 start、尾帧 end（end=None 就只给首帧），生成 length 帧（16 帧/秒，长度须是 4 的倍数 + 1）。"""
    wf = {
        '1': {'class_type': 'UnetLoaderGGUF', 'inputs': {'unet_name': 'wan22_i2v_high_Q4_K_M.gguf'}},
        '2': {'class_type': 'UnetLoaderGGUF', 'inputs': {'unet_name': 'wan22_i2v_low_Q4_K_M.gguf'}},
        '3': {'class_type': 'LoraLoaderModelOnly', 'inputs': {'model': ['1', 0], 'lora_name': 'wan22_i2v_lightning_high.safetensors', 'strength_model': 1.0}},
        '4': {'class_type': 'LoraLoaderModelOnly', 'inputs': {'model': ['2', 0], 'lora_name': 'wan22_i2v_lightning_low.safetensors', 'strength_model': 1.0}},
        '5': {'class_type': 'ModelSamplingSD3', 'inputs': {'model': ['3', 0], 'shift': 5.0}},
        '6': {'class_type': 'ModelSamplingSD3', 'inputs': {'model': ['4', 0], 'shift': 5.0}},
        '7': {'class_type': 'CLIPLoader', 'inputs': {'clip_name': 'umt5_xxl_fp8_e4m3fn_scaled.safetensors', 'type': 'wan', 'device': 'default'}},
        '8': {'class_type': 'VAELoader', 'inputs': {'vae_name': 'wan_2.1_vae.safetensors'}},
        '9': {'class_type': 'CLIPTextEncode', 'inputs': {'clip': ['7', 0], 'text': prompt}},
        '10': {'class_type': 'CLIPTextEncode', 'inputs': {'clip': ['7', 0], 'text': neg}},
        '11': {'class_type': 'LoadImage', 'inputs': {'image': start}},
    }
    fl = {'positive': ['9', 0], 'negative': ['10', 0], 'vae': ['8', 0], 'width': width, 'height': height, 'length': length, 'batch_size': 1, 'start_image': ['11', 0]}
    if end:
        wf['12'] = {'class_type': 'LoadImage', 'inputs': {'image': end}}
        fl['end_image'] = ['12', 0]
    wf['13'] = {'class_type': 'WanFirstLastFrameToVideo', 'inputs': fl}
    wf['14'] = {'class_type': 'KSamplerAdvanced', 'inputs': {'model': ['5', 0], 'add_noise': 'enable', 'noise_seed': seed, 'steps': 4, 'cfg': 1.0, 'sampler_name': 'euler', 'scheduler': 'simple',
                                                            'positive': ['13', 0], 'negative': ['13', 1], 'latent_image': ['13', 2], 'start_at_step': 0, 'end_at_step': 2, 'return_with_leftover_noise': 'enable'}}
    wf['15'] = {'class_type': 'KSamplerAdvanced', 'inputs': {'model': ['6', 0], 'add_noise': 'disable', 'noise_seed': 0, 'steps': 4, 'cfg': 1.0, 'sampler_name': 'euler', 'scheduler': 'simple',
                                                            'positive': ['13', 0], 'negative': ['13', 1], 'latent_image': ['14', 0], 'start_at_step': 2, 'end_at_step': 10000, 'return_with_leftover_noise': 'disable'}}
    wf['16'] = {'class_type': 'VAEDecode', 'inputs': {'samples': ['15', 0], 'vae': ['8', 0]}}
    wf['17'] = {'class_type': 'SaveImage', 'inputs': {'images': ['16', 0], 'filename_prefix': prefix}}
    return run(wf)
