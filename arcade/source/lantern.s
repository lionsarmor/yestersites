; Lantern Run · Original YesterSites homebrew. Assemble with ca65 and ld65.
.segment "HEADER"
.byte "NES",$1a,1,1,0,0,0,0,0,0,0,0,0,0
.segment "ZEROPAGE"
px: .res 1
py: .res 1
score: .res 1
pad: .res 1
tick: .res 1
dx: .res 1
dy: .res 1
step: .res 1
src: .res 2
.segment "CODE"
reset:
  sei
  cld
  ldx #$ff
  txs
  inx
  stx $2000
  stx $2001
  stx $4010
  lda #$40
  sta $4017
  bit $2002
: bit $2002
  bpl :-
  lda #0
  tax
: sta $00,x
  inx
  bne :-
: bit $2002
  bpl :-
  lda #$3f
  sta $2006
  lda #0
  sta $2006
  tax
: lda palette,x
  sta $2007
  inx
  cpx #32
  bne :-
  lda #$20
  sta $2006
  lda #0
  sta $2006
  lda #<map
  sta src
  lda #>map
  sta src+1
  ldx #4
  ldy #0
: lda (src),y
  sta $2007
  iny
  bne :-
  inc src+1
  dex
  bne :-
  lda #$ff
  ldx #0
: sta $0200,x
  inx
  bne :-
  jsr start_round
  lda #1
  sta $4015
  lda #$88
  sta $2000
  lda #$1e
  sta $2001
loop: jmp loop

start_round:
  lda #72
  sta px
  lda #112
  sta py
  lda #0
  sta score
  rts

nmi:
  pha
  txa
  pha
  tya
  pha
  inc tick
  lda #1
  sta $4016
  lda #0
  sta $4016
  lda #1
  sta pad
: lda $4016
  lsr
  rol pad
  bcc :-
  lda score
  cmp #6
  bcc move
  lda pad
  and #$10
  bne :+
  jmp display
: jsr start_round
  jmp display
move:
  lda #1
  sta step
  bit pad
  bpl :+
  inc step
: lda pad
  and #1
  beq :+
  lda px
  cmp #230
  bcs :+
  adc step
  sta px
: lda pad
  and #2
  beq :+
  lda px
  cmp #12
  bcc :+
  sbc step
  sta px
: lda pad
  and #4
  beq :+
  lda py
  cmp #199
  bcs :+
  adc step
  sta py
: lda pad
  and #8
  beq :+
  lda py
  cmp #59
  bcc :+
  sbc step
  sta py
: ldx score
  lda px
  clc
  adc #14
  sec
  sbc targetx,x
  cmp #21
  bcs display
  lda py
  clc
  adc #14
  sec
  sbc targety,x
  cmp #21
  bcs display
  inc score
  lda #$82
  sta $4000
  lda #0
  sta $4001
  lda notes,x
  sta $4002
  lda #$20
  sta $4003
display:
  ; Assemble the four quadrants of Pip's sprite in the shadow OAM.
  ldx #0
: txa
  lsr
  lsr
  tay
  lda py
  clc
  adc yoffset,y
  sta $0200,x
  tya
  pha
  lda tick
  and #8
  beq :+
  tya
  clc
  adc #4
  tay
: tya
  clc
  adc #$e0
  sta $0201,x
  pla
  tay
  lda #0
  sta $0202,x
  lda px
  clc
  adc xoffset,y
  sta $0203,x
  inx
  inx
  inx
  inx
  cpx #16
  bne :--
  ldy score
  cpy #6
  bcs caught
  lda targety,y
  sta $0210
  lda targetx,y
  sta $0213
  lda tick
  lsr
  lsr
  lsr
  and #1
  clc
  adc #$e8
  sta $0211
  lda #1
  sta $0212
  jmp hud
caught:
  lda #$ff
  sta $0210
hud:
  bit $2002
  lda #$20
  sta $2006
  lda #$59          ; row 2, col 25
  sta $2006
  lda score
  clc
  adc #48
  sta $2007
  lda #$23
  sta $2006
  lda #$64          ; row 27, col 4
  sta $2006
  ldx #0
: lda score
  cmp #6
  bcs :+
  lda playing,x
  jmp put
: lda won,x
put:
  sta $2007
  inx
  cpx #24
  bne :--
  lda #0
  sta $2005
  sta $2005
  sta $2003
  lda #2
  sta $4014
  pla
  tay
  pla
  tax
  pla
irq: rti
.segment "RODATA"
playing: .byte "CATCH SIX FIREFLIES     "
won:     .byte "ALL LIT! START TO REPLAY"
targetx: .byte 104,172,41,198,114,63
targety: .byte 112,81,149,164,65,181
xoffset: .byte 0,8,0,8
yoffset: .byte 0,0,8,8
notes: .byte 170,143,127,113,95,84
palette:
.byte $0f,$0c,$1c,$38, $0f,$0c,$2c,$38, $0f,$0c,$1c,$38, $0f,$03,$13,$33
.byte $0f,$10,$38,$36, $0f,$27,$38,$30, $0f,$06,$26,$30, $0f,$09,$19,$29
map: .incbin "landscape.bin"
.segment "VECTORS"
.word nmi,reset,irq
.segment "CHARS"
.incbin "lantern.chr"
