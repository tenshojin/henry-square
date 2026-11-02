# 补帧：AI 生成的片段是 16 帧/秒，用 RIFE 4.9 在每两帧中间补一帧，变成 32 帧/秒（人走路、镜头移动更顺）。
# RIFE 的网络结构借用 ComfyUI-Frame-Interpolation 的代码（D:\tools\vfi），模型 D:\tools\vfi_models\rife49.pth。
# 用法：python interp.py 输入帧目录 输出帧目录 [cpu]
import os, sys, types
import numpy as np
import torch
from PIL import Image

VFI = r'D:\tools\vfi'
MODEL = r'D:\tools\vfi_models\rife49.pth'


def load_net(device):
    # rife_arch.py 开头要 comfy.model_management.get_torch_device，这里塞一个假的
    mm = types.ModuleType('comfy.model_management')
    mm.get_torch_device = lambda: torch.device(device)
    sys.modules.setdefault('comfy', types.ModuleType('comfy'))
    sys.modules['comfy.model_management'] = mm
    sys.path.insert(0, os.path.join(VFI, 'vfi_models', 'rife'))
    import rife_arch
    net = rife_arch.IFNet(arch_ver='4.7')
    net.load_state_dict(torch.load(MODEL, map_location='cpu', weights_only=False))
    return net.eval().to(device)


def to_t(path, device):
    a = np.asarray(Image.open(path).convert('RGB'), dtype=np.float32) / 255
    return torch.from_numpy(a).permute(2, 0, 1)[None].to(device)


def save(t, path):
    a = (t[0].permute(1, 2, 0).clamp(0, 1).cpu().numpy() * 255 + 0.5).astype(np.uint8)
    Image.fromarray(a).save(path)


@torch.inference_mode()
def interp_dir(src, dst, device='cuda', net=None):
    """src 里 n 帧 → dst 里 2n-1 帧（原帧之间各补一帧）。"""
    net = net or load_net(device)
    names = sorted(f for f in os.listdir(src) if f.endswith('.png'))
    os.makedirs(dst, exist_ok=True)
    k = 0
    prev = to_t(os.path.join(src, names[0]), device)
    for name in names[1:]:
        cur = to_t(os.path.join(src, name), device)
        save(prev, os.path.join(dst, '%05d.png' % k))
        mid = net(prev, cur, timestep=0.5, scale_list=[8, 4, 2, 1], training=False, fastmode=True, ensemble=True)
        save(mid, os.path.join(dst, '%05d.png' % (k + 1)))
        k += 2
        prev = cur
    save(prev, os.path.join(dst, '%05d.png' % k))
    return k + 1


if __name__ == '__main__':
    print(interp_dir(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else 'cuda'))
