"""Rebuild Lantern Run with Python 3, Pillow, ca65 and ld65 on PATH."""
from pathlib import Path
from PIL import Image, ImageDraw
import random, subprocess, tempfile

HERE = Path(__file__).resolve().parent
# Each hex pair is one hand-drawn row in a five-pixel-wide character.
GLYPHS = {
'A':'0e11111f111111','B':'1e11111e11111e','C':'0f10101010100f',
'D':'1e11111111111e','E':'1f10101e10101f','F':'1f10101e101010',
'G':'0e11101013110e','H':'1111111f111111','I':'1f04040404041f',
'J':'0101010111110e','K':'11121418141211','L':'1010101010101f',
'M':'111b1515111111','N':'11191915131311','O':'0e11111111110e',
'P':'1e11111e101010','Q':'0e11111115120d','R':'1e11111e141211',
'S':'0f10100e01011e','T':'1f040404040404','U':'1111111111110e',
'V':'11111111110a04','W':'1111111515150a','X':'11110a040a1111',
'Y':'11110a04040404','Z':'1f01020408101f','0':'0e11131519110e',
'1':'040c040404040e','2':'0e11010204081f','3':'1e01010e01011e',
'4':'02060a121f0202','5':'1f10101e01011e','6':'0e10101e11110e',
'/':'01010204081010','!':'04040404040004',' ':'00000000000000',
}

def encode(tile):
    return bytes(sum(((tile.getpixel((x,y)) >> plane) & 1) << (7-x) for x in range(8))
                 for plane in range(2) for y in range(8))

def draw_letter(ch):
    im=Image.new('P',(8,8))
    for y,row in enumerate(bytes.fromhex(GLYPHS[ch])):
        for x in range(5):
            if row & (16 >> x): im.putpixel((x+1,y+1),3)
    return im

def artwork():
    tiles=[bytes(16) for _ in range(512)]
    for ch in GLYPHS: tiles[ord(ch)]=encode(draw_letter(ch))
    scene=Image.new('P',(256,240)); d=ImageDraw.Draw(scene); rng=random.Random(429)
    def text(x,y,label):
        for i,ch in enumerate(label): scene.paste(draw_letter(ch),(x+i*8,y))
    text(16,16,'LANTERN RUN');text(144,16,'LIGHTS 0/6')
    d.line((9,32,245,32),fill=2)
    for x in range(12,245,8):d.line((x,31,x+3,31),fill=1)
    # Sparse fixed tile-aligned stars, crescent and cirrus.
    for y in range(5,15):
        for x in range(1,31):
            n=rng.randrange(17)
            if n==1:d.point((x*8+2,y*8+3),fill=2)
            if n==2:d.point((x*8+5,y*8+1),fill=1)
            if n==3:d.line((x*8+3,y*8+2,x*8+3,y*8+4),fill=2);d.line((x*8+2,y*8+3,x*8+4,y*8+3),fill=2);d.point((x*8+3,y*8+3),fill=3)
    d.ellipse((169,46,202,79),fill=3);d.ellipse((179,40,208,68),fill=0)
    for x,y in [(96,72),(8,89),(206,85)]:
        d.line((x,y,x+27,y),fill=1);d.line((x+9,y-2,x+20,y-2),fill=1)
    # Two ridgelines and silhouettes of cypress trees on the shoreline.
    hills=[(-48,151),(0,130),(24,139),(63,111),(104,144),(145,122),(168,134),(200,111),(232,129),(264,115),(272,159),(-48,159)]
    d.polygon(hills,fill=1)
    for x,h in [(0,11),(12,17),(24,8),(40,14),(59,10),(73,16),(100,10),(113,15),(132,10),(145,17),(170,8),(188,13),(212,17),(224,10),(240,15),(252,8)]:
        d.polygon([(x-7,153),(x,153-h),(x+7,153)],fill=0);d.line((x,149,x,158),fill=0)
    d.rectangle((0,158,255,210),fill=1)
    for y in range(160,202,8):
        for x in range(0,256,16):
            if rng.randrange(4)==0:d.line((x+2,y+3,x+9,y+3),fill=2)
    for x,y,w in [(178,161,18),(170,167,21),(181,175,10),(173,182,16),(177,189,6)]:
        d.line((x,y,x+w,y),fill=3)
    for x in range(1,255,8):
        h=rng.choice([4,7,11]);d.line((x,206,x,206-h),fill=0);d.line((x,202,x+3,199),fill=0)
    d.rectangle((0,206,255,239),fill=0)
    text(32,216,'CATCH SIX FIREFLIES')
    # Reuse identical tiles by pattern to fit an NROM cartridge.
    slots=iter(n for n in range(1,256) if chr(n) not in GLYPHS)
    by_pattern={tiles[ord(c)]:ord(c) for c in GLYPHS};nametable=bytearray()
    for y in range(30):
        for x in range(32):
            packed=encode(scene.crop((x*8,y*8,x*8+8,y*8+8)))
            if packed not in by_pattern:
                n=next(slots);by_pattern[packed]=n;tiles[n]=packed
            nametable.append(by_pattern[packed])
    def palette(row):
        return 1 if row<4 or row>=26 else (0 if row<16 else (2 if row<20 else 1))
    for ay in range(8):
        for ax in range(8):
            nametable.append(palette(ay*4)*5+palette(ay*4+2)*80)
    # Two animation poses for Pip the moth.
    for frame in range(2):
        moth=Image.new('P',(16,16));p=ImageDraw.Draw(moth)
        for flip in (False,True):
            def shape(points,col):p.polygon([(15-x if flip else x,y) for x,y in points],fill=col)
            h=frame*3
            shape([(1,2+h),(4,2+h),(8,7),(7,12),(3,11),(0,7+h)],1)
            shape([(2,3+h),(4,4+h),(6,7),(4,8),(2,6+h)],2)
            shape([(2,10),(6,8),(7,11),(5,14),(2,13)],3)
        p.rectangle((7,6,8,12),fill=3);p.rectangle((6,5,9,7),fill=2)
        p.line((6,5,4,2),fill=3);p.line((9,5,11,2),fill=3)
        for i in range(4):
            x=i%2*8;y=i//2*8;tiles[256+224+frame*4+i]=encode(moth.crop((x,y,x+8,y+8)))
    for i in range(2):
        fire=Image.new('P',(8,8));p=ImageDraw.Draw(fire)
        p.line((3,0+i,3,6-i),fill=2);p.line((0+i,3,6-i,3),fill=2)
        p.rectangle((2,2,4,4),fill=3);p.point((3,3),fill=1)
        tiles[256+232+i]=encode(fire)
    return b''.join(tiles),bytes(nametable)

def build():
    with tempfile.TemporaryDirectory() as temp:
        temp=Path(temp);chr_data,map_data=artwork()
        (temp/'lantern.chr').write_bytes(chr_data);(temp/'landscape.bin').write_bytes(map_data)
        subprocess.run(['ca65','--bin-include-dir',str(temp),str(HERE/'lantern.s'),'-o',str(temp/'lantern.o')],check=True)
        subprocess.run(['ld65','-C',str(HERE/'lantern.cfg'),str(temp/'lantern.o'),'-o',str(HERE.parent/'lantern-run.nes')],check=True)
if __name__=='__main__':build()
