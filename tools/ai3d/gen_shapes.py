# 用 Hunyuan3D-2mv（多视图生成形状）把四个人物的三视图变成三维网格
# 用法：python gen_shapes.py [人物名...] [--seed N] [--steps N] [--octree N] [--views 目录] [--tag 后缀]
#   整身：默认读 views\，输出 shapes\名字.glb
#   头部特写：--views D:\ai3d\work\heads --tag _head（读 restore_faces.py 做的头部特写，输出 shapes\名字_head.glb）
import sys, os, time, argparse
sys.path.insert(0, r'D:\ai3d\Hunyuan3D-2')
import torch
from PIL import Image
from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
from hy3dgen.shapegen.postprocessors import FloaterRemover, DegenerateFaceRemover
from hy3dgen.shapegen.models import conditioner as _cond

# 新版 transformers 的 DINOv2 改了参数名（query→q_proj…，SwiGLU 的 weights_in 拆成 gate/up 两半）：读权重时换个名字
_orig_load = _cond.SingleImageEncoder.load_state_dict


def _remap(sd):
    out = {}
    for k, v in sd.items():
        k2 = (k.replace('.attention.attention.query.', '.attention.q_proj.')
               .replace('.attention.attention.key.', '.attention.k_proj.')
               .replace('.attention.attention.value.', '.attention.v_proj.')
               .replace('.attention.output.dense.', '.attention.o_proj.')
               .replace('.mlp.weights_out.', '.mlp.down_proj.'))
        if '.mlp.weights_in.' in k2:
            gate, up = v.chunk(2, dim=0)
            out[k2.replace('.mlp.weights_in.', '.mlp.gate_proj.')] = gate
            out[k2.replace('.mlp.weights_in.', '.mlp.up_proj.')] = up
        else:
            out[k2] = v
    return out


def _load(self, sd, *a, **kw):
    return _orig_load(self, _remap(sd), *a, **kw)


_cond.SingleImageEncoder.load_state_dict = _load

SIDE = {'dicer': 'right', 'drinker': 'right', 'elder': 'left', 'barmaid': 'left'}
ap = argparse.ArgumentParser()
ap.add_argument('names', nargs='*', default=list(SIDE))
ap.add_argument('--seed', type=int, default=1234)
ap.add_argument('--steps', type=int, default=50)
ap.add_argument('--octree', type=int, default=384)
ap.add_argument('--guidance', type=float, default=5.0)
ap.add_argument('--tag', default='')
ap.add_argument('--views', default=os.path.join('D:' + os.sep, 'ai3d', 'work', 'views'))
args = ap.parse_args()
VIEWS = args.views
OUT = os.path.join('D:' + os.sep, 'ai3d', 'work', 'shapes')
os.makedirs(OUT, exist_ok=True)
t0 = time.time()
pipe = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained('tencent/Hunyuan3D-2mv', subfolder='hunyuan3d-dit-v2-mv', variant='fp16')
print('loaded %.1fs' % (time.time() - t0), 'views', VIEWS, flush=True)
for name in args.names:
    t1 = time.time()
    imgs = {
        'front': Image.open(os.path.join(VIEWS, name + '_front.png')).convert('RGBA'),
        SIDE[name]: Image.open(os.path.join(VIEWS, name + '_side.png')).convert('RGBA'),
        'back': Image.open(os.path.join(VIEWS, name + '_back.png')).convert('RGBA'),
    }
    mesh = pipe(image=imgs, num_inference_steps=args.steps, octree_resolution=args.octree, num_chunks=20000,
                guidance_scale=args.guidance, generator=torch.manual_seed(args.seed), output_type='trimesh')[0]
    mesh = FloaterRemover()(mesh)
    mesh = DegenerateFaceRemover()(mesh)
    p = os.path.join(OUT, '%s%s.glb' % (name, args.tag))
    mesh.export(p)
    print(name, 'faces', len(mesh.faces), 'verts', len(mesh.vertices), 'bounds', mesh.bounds.round(3).tolist(), '%.1fs' % (time.time() - t1), flush=True)
