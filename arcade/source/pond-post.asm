; Pond Post — deliver three letters to the blinking post box.
SECTION "Entry", ROM0[$100]
nop
jp boot
ds $150-@,0
SECTION "Post route", ROM0[$150]
boot:
 di
 ld sp,$dfff
 call vblank
 xor a
 ldh [$ff40],a
 ld hl,tiles
 ld de,$8000
 ld bc,tilesEnd-tiles
 call copy
 ld hl,map
 ld de,$9800
 ld bc,32*18
 call copy
 ld hl,$fe00
 ld b,160
 xor a
.clear:
 ld [hli],a
 dec b
 jr nz,.clear
 ld a,$e4
 ldh [$ff47],a
 ldh [$ff48],a
 ld a,$93
 ldh [$ff40],a
restart:
 ld a,32
 ld [px],a
 ld a,88
 ld [py],a
 xor a
 ld [points],a
 ld [phase],a
frame:
 call vblank
 ld a,[phase]
 inc a
 ld [phase],a
 ld a,$20
 ldh [$ff00],a
 ldh a,[$ff00]
 ldh a,[$ff00]
 cpl
 ld b,a
 ld a,[points]
 cp 3
 jr z,buttons
 bit 0,b
 jr z,.left
 ld a,[px]
 cp 155
 jr nc,.left
 inc a
 ld [px],a
.left:
 bit 1,b
 jr z,.up
 ld a,[px]
 cp 9
 jr c,.up
 dec a
 ld [px],a
.up:
 bit 2,b
 jr z,.down
 ld a,[py]
 cp 49
 jr c,.down
 dec a
 ld [py],a
.down:
 bit 3,b
 jr z,buttons
 ld a,[py]
 cp 135
 jr nc,buttons
 inc a
 ld [py],a
buttons:
 ld a,$10
 ldh [$ff00],a
 ldh a,[$ff00]
 ldh a,[$ff00]
 cpl
 ld b,a
 ld a,[points]
 cp 3
 jr nz,.delivery
 bit 3,b
 jr nz,restart
 jr render
.delivery:
 bit 0,b
 jr z,render
 call address
 ld a,[px]
 add a,9
 sub [hl]
 cp 19
 jr nc,render
 inc hl
 ld a,[py]
 add a,9
 sub [hl]
 cp 19
 jr nc,render
 ld a,[points]
 inc a
 ld [points],a
 ld a,$80
 ldh [$ff26],a
 ld a,$77
 ldh [$ff24],a
 ld a,$11
 ldh [$ff25],a
 ld a,$80
 ldh [$ff11],a
 ld a,$b2
 ldh [$ff12],a
 ld a,$a0
 ldh [$ff13],a
 ld a,$86
 ldh [$ff14],a
render:
 ld hl,$fe00
 ld a,[py]
 ld [hli],a
 ld a,[px]
 ld [hli],a
 ld a,224
 ld [hli],a
 xor a
 ld [hli],a
 ld a,[points]
 add a,48
 ld [$982f],a
 ld a,[points]
 cp 3
 jr c,.mail
 xor a
 ld [$fe04],a
 ld hl,done
 ld de,$9a04
 ld bc,13
 call copy
 jp frame
.mail:
 ld hl,help
 ld de,$9a04
 ld bc,13
 call copy
 call address
 ld a,[hli]
 ld [$fe05],a
 ld a,[hl]
 ld [$fe04],a
 ld a,[phase]
 and 16
 ld a,225
 jr z,.draw
 inc a
.draw:
 ld [$fe06],a
 jp frame
address:
 ld a,[points]
 add a,a
 ld e,a
 ld d,0
 ld hl,boxes
 add hl,de
 ret
copy:
 ld a,[hli]
 ld [de],a
 inc de
 dec bc
 ld a,b
 or c
 jr nz,copy
 ret
vblank:
 ldh a,[$ff44]
 cp 144
 jr nc,vblank
.wait:
 ldh a,[$ff44]
 cp 144
 jr c,.wait
 ret
boxes: db 76,88,124,62,54,119
help: db "A: POST LETTER"
done: db "ROUTE DONE!  "
map: INCBIN "pond.map"
tiles: INCBIN "pond.chr"
tilesEnd:
SECTION "Bag", WRAM0
px: ds 1
py: ds 1
points: ds 1
phase: ds 1
