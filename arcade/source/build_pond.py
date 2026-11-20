"""Rebuild Pond Post with Pillow and RGBDS (rgbasm, rgblink, rgbfix)."""
import subprocess,tempfile,random
from pathlib import Path
from PIL import Image,ImageDraw
from build import GLYPHS,draw_letter
HERE=Path(__file__).resolve().parent
def pack(tile):
    return bytes(sum(((tile.getpixel((x,y))>>p)&1)<<(7-x) for x in range(8)) for y in range(8) for p in range(2))
def assets():
    scene=Image.new('P',(160,144),0);d=ImageDraw.Draw(scene)
    def text(x,y,s):
        for i,c in enumerate(s):
            if c in GLYPHS:scene.paste(draw_letter(c),(x+i*8,y))
    text(8,8,'POND POST');text(112,8,' 0/3')
    d.line((5,21,154,21),fill=3);d.line((11,23,149,23),fill=1)
    rng=random.Random(2648)
    for i in range(35):
        x=rng.randrange(1,18)*8;y=rng.randrange(4,15)*8
        d.line((x,y,x+5,y),fill=1)
    for x,y in [(16,88),(34,51),(102,95),(126,63),(63,108),(144,119),(4,70),(82,34)]:
        d.ellipse((x,y,x+13,y+6),fill=1,outline=2);d.line((x+6,y+3,x+10,y+1),fill=0)
    for x,y in [(9,43),(100,62),(73,115),(128,38)]:
        for i in range(4):
            h=[4,9,6,8][i];d.line((x+i*2,y,x+i*2,y-h),fill=2);d.line((x+i*2,y-h,x+i*2-2,y-h-2),fill=3)
    d.line((5,125,154,125),fill=2);text(32,128,'A  POST LETTER')
    tiles=[bytes(16)]*256
    for c in GLYPHS:tiles[ord(c)]=pack(draw_letter(c))
    col=Image.new('P',(8,8));ImageDraw.Draw(col).point([(3,2),(3,5)],fill=3);tiles[58]=pack(col)
    patterns={tiles[ord(c)]:ord(c) for c in GLYPHS}
    slots=iter(i for i in range(1,221) if chr(i) not in GLYPHS and i!=58);nam=bytearray()
    for ty in range(18):
        for tx in range(32):
            block=pack(scene.crop((tx*8,ty*8,tx*8+8,ty*8+8)))
            if block not in patterns:
                i=next(slots);patterns[block]=i;tiles[i]=block
            nam.append(patterns[block])
    for i,lines in enumerate([['.33..33.','31333313','32222223','.333333.','..3223..','.323323.','33....33','........'],
        ['..3333..','33333333','31111113','32333223','32222223','33333333','...33...','...33...'],
        ['..3333..','33333333','32222223','31133113','31111113','33333333','...33...','...33...']]):
        t=Image.new('P',(8,8));t.putdata([int(c) if c!='.' else 0 for row in lines for c in row]);tiles[224+i]=pack(t)
    return bytes(nam),b''.join(tiles)
if __name__=='__main__':
    with tempfile.TemporaryDirectory() as tmp:
        p=Path(tmp);m,t=assets();(p/'pond.map').write_bytes(m);(p/'pond.chr').write_bytes(t)
        subprocess.run(['rgbasm','-I',str(p)+'/','-o',str(p/'pond.o'),str(HERE/'pond-post.asm')],check=True)
        rom=HERE.parent/'pond-post.gb'
        subprocess.run(['rgblink','-p','0','-o',str(rom),str(p/'pond.o')],check=True)
        subprocess.run(['rgbfix','-v','-p','0','-t','POND POST',str(rom)],check=True)
