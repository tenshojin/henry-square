#!/bin/bash
# 本地 AI 图生 3D 环境（装在 D:\ai3d，约 20 GB）：uv 管理的 Python 3.11 + PyTorch(cu128)
#   + Hunyuan3D-2（只用形状生成部分）+ Real-ESRGAN（放大三视图）+ GFPGAN / MediaPipe（修复脸）+ Marigold（估算法线、估算光照）
# 装好后的流程（都在 D:\ai3d\work 里跑，脚本就是本目录这几个；运行前 export HF_HOME='D:\ai3d\hf'）：
#   1. prep_views.py     从设定图切出四个人的 正面/侧面/背面，去背景 → views\
#   2. gen_shapes.py     Hunyuan3D-2mv 用三视图生成整身网格 → shapes\*.glb（每个人约 4–6 分钟，RTX 5070 Ti Laptop）
#   3. upscale_views.py  Real-ESRGAN 4 倍放大衣服部分 → views_sr\
#   4. restore_faces.py  GFPGAN 修复正面的脸 → views_face\；切出头部特写 → heads\（含 heads.json）
#   5. gen_shapes.py --views D:\ai3d\work\heads --tag _head   头部特写单独生成 → shapes\*_head.glb
#   6. normals_views.py  Marigold 法线 → normals\*.npy
#   7. skin_delight.py   去掉照片自带的光影（Marigold IID 估光照）→ heads_albedo\、views_albedo\；
#                        皮肤 / 眼睛 / 嘴唇的材质图和脸的范围（MediaPipe 分区 + 人脸关键点）→ heads_mat\、views_mat\
#   把 views_sr、views_face、heads、normals、heads_albedo、views_albedo、heads_mat、views_mat 这些文件夹拷到 C:\blender\henry_square\reference\，
#   再在 Blender 里跑 tools/blender/build_characters.py（chars_ai.py）
set -x
export UV_CACHE_DIR=/d/ai3d/uv-cache
export UV_PYTHON_INSTALL_DIR=/d/ai3d/python
export HF_HOME='D:\ai3d\hf'
cd /d/ai3d
./uv/uv.exe venv --python 3.11 venv
./uv/uv.exe pip install --python venv/Scripts/python.exe torch torchvision --index-url https://download.pytorch.org/whl/cu128
git clone --depth 1 https://github.com/Tencent-Hunyuan/Hunyuan3D-2.git || git clone --depth 1 https://github.com/Tencent/Hunyuan3D-2.git
./uv/uv.exe pip install --python venv/Scripts/python.exe diffusers transformers accelerate einops trimesh pymeshlab "rembg[gpu]" onnxruntime omegaconf opencv-python scikit-image huggingface_hub safetensors pillow tqdm pygltflib xatlas spandrel mediapipe
mkdir -p esrgan gfpgan mediapipe
curl -sSL -o esrgan/RealESRGAN_x4plus.pth https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth
curl -sSL -o gfpgan/GFPGANv1.4.pth https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth
curl -sSL -o mediapipe/face_landmarker.task https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
curl -sSL -o mediapipe/selfie_multiclass_256x256.tflite https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite
venv/Scripts/python.exe -c "from huggingface_hub import snapshot_download; snapshot_download('tencent/Hunyuan3D-2mv', allow_patterns=['hunyuan3d-dit-v2-mv/*']); snapshot_download('prs-eth/marigold-normals-v1-1', allow_patterns=['*.json', '*.txt', '*.fp16.safetensors']); snapshot_download('prs-eth/marigold-iid-lighting-v1-1', allow_patterns=['*.json', '*.txt', '*.fp16.safetensors'])"
venv/Scripts/python.exe -c "import torch;print('TORCH', torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0))"
echo SETUP_DONE
