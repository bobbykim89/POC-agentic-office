import Phaser from 'phaser';

type FacingDirection = 'front' | 'back' | 'left' | 'right';

const EXTERNAL_SPRITE_SHEET_KEY = 'office-worker-sheet';
const EXTERNAL_SPRITE_SHEET_PATH = '/sprites/office-worker-directions.png';
const SHEET_DIRECTION_ORDER: Array<Exclude<FacingDirection, 'left'>> = ['front', 'back', 'right'];
const FALLBACK_FRAME_WIDTH = 72;
const FALLBACK_FRAME_HEIGHT = 108;
const MOVE_SPEED = 220;
const CHARACTER_BOUNDS = new Phaser.Geom.Rectangle(72, 160, 816, 360);

class OfficeScene extends Phaser.Scene {
  private arrowKeys!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };
  private actor!: Phaser.GameObjects.Image;
  private facing: FacingDirection = 'front';
  private actorVelocity = new Phaser.Math.Vector2(0, 0);

  constructor() {
    super('office-scene');
  }

  preload() {
    this.load.image(EXTERNAL_SPRITE_SHEET_KEY, EXTERNAL_SPRITE_SHEET_PATH);
  }

  create() {
    this.cameras.main.setBackgroundColor('#122033');
    this.createBackdrop();
    this.createDirectionalTextures();

    this.actor = this.add
      .image(480, 420, this.getTextureKeyForDirection(this.facing))
      .setOrigin(0.5, 1);

    const actorTexture = this.textures.get(this.getTextureKeyForDirection(this.facing));
    const actorSource = actorTexture.getSourceImage() as HTMLCanvasElement | HTMLImageElement;
    const targetHeight = 132;
    this.actor.setScale(targetHeight / actorSource.height);

    this.input.keyboard?.disableGlobalCapture();
    this.arrowKeys = this.input.keyboard!.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
    }) as OfficeScene['arrowKeys'];
  }

  update(_: number, delta: number) {
    const elapsed = delta / 1000;
    const movement = this.readMovementInput();

    this.actorVelocity.copy(movement);
    if (this.actorVelocity.lengthSq() > 0) {
      this.actorVelocity.normalize().scale(MOVE_SPEED * elapsed);
      this.actor.x = Phaser.Math.Clamp(
        this.actor.x + this.actorVelocity.x,
        CHARACTER_BOUNDS.left,
        CHARACTER_BOUNDS.right,
      );
      this.actor.y = Phaser.Math.Clamp(
        this.actor.y + this.actorVelocity.y,
        CHARACTER_BOUNDS.top,
        CHARACTER_BOUNDS.bottom,
      );
      this.updateFacingFromVelocity(movement);
    }
  }

  private createBackdrop() {
    this.add
      .rectangle(480, 300, 960, 600, 0x122033)
      .setStrokeStyle(0, 0x000000, 0);

    const floor = this.add.rectangle(480, 468, 860, 188, 0x1b2d42);
    floor.setStrokeStyle(4, 0x45617c, 0.8);

    for (let x = CHARACTER_BOUNDS.left; x <= CHARACTER_BOUNDS.right; x += 68) {
      this.add.line(x, 374, 0, 0, 0, 188, 0x2d4762, 0.42).setOrigin(0, 0);
    }

    for (let y = CHARACTER_BOUNDS.top + 16; y <= CHARACTER_BOUNDS.bottom; y += 44) {
      this.add.line(72, y, 0, 0, 816, 0, 0x2d4762, 0.38).setOrigin(0, 0);
    }

    this.add
      .text(40, 36, 'Keyboard Movement Test', {
        color: '#f8f3e7',
        fontFamily: 'Georgia',
        fontSize: '30px',
      })
      .setShadow(2, 2, '#000000', 4, false, true);

    this.add.text(
      40,
      80,
      'Move with arrow keys. The sprite should face its travel direction and stay idle while inputs are focused.',
      {
        color: '#c9d8e8',
        fontFamily: 'Arial',
        fontSize: '18px',
      },
    );

    this.add.text(40, 108, `Drop your sheet at ${EXTERNAL_SPRITE_SHEET_PATH} to replace the fallback art.`, {
      color: '#8fb4d8',
      fontFamily: 'Arial',
      fontSize: '14px',
    });

    this.add
      .rectangle(480, 420, CHARACTER_BOUNDS.width, CHARACTER_BOUNDS.height, 0x000000, 0)
      .setStrokeStyle(3, 0x86a4bf, 0.7);
  }

  private createDirectionalTextures() {
    if (this.textures.exists(EXTERNAL_SPRITE_SHEET_KEY)) {
      this.createDirectionalTexturesFromSheet();
      return;
    }

    this.createFallbackDirectionalTextures();
  }

  private createDirectionalTexturesFromSheet() {
    const texture = this.textures.get(EXTERNAL_SPRITE_SHEET_KEY);
    const source = texture.getSourceImage() as HTMLImageElement;
    const frameWidth = Math.floor(source.width / SHEET_DIRECTION_ORDER.length);
    const frameHeight = source.height;

    SHEET_DIRECTION_ORDER.forEach((direction, index) => {
      const textureKey = this.getTextureKeyForDirection(direction);
      if (this.textures.exists(textureKey)) {
        return;
      }

      const canvasTexture = this.textures.createCanvas(textureKey, frameWidth, frameHeight);
      if (!canvasTexture) {
        return;
      }

      canvasTexture.context.imageSmoothingEnabled = false;
      canvasTexture.context.drawImage(
        source,
        index * frameWidth,
        0,
        frameWidth,
        frameHeight,
        0,
        0,
        frameWidth,
        frameHeight,
      );
      canvasTexture.refresh();
    });

    this.createFlippedLeftTexture();
  }

  private createFallbackDirectionalTextures() {
    (['front', 'back', 'right'] as const).forEach((direction) => {
      const textureKey = this.getTextureKeyForDirection(direction);
      if (this.textures.exists(textureKey)) {
        return;
      }

      const canvasTexture = this.textures.createCanvas(
        textureKey,
        FALLBACK_FRAME_WIDTH,
        FALLBACK_FRAME_HEIGHT,
      );
      if (!canvasTexture) {
        return;
      }

      const ctx = canvasTexture.context;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, FALLBACK_FRAME_WIDTH, FALLBACK_FRAME_HEIGHT);

      this.drawFallbackShadow(ctx);
      this.drawFallbackBody(ctx, direction);
      canvasTexture.refresh();
    });

    this.createFlippedLeftTexture();
  }

  private drawFallbackShadow(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = 'rgba(8, 15, 26, 0.24)';
    ctx.beginPath();
    ctx.ellipse(36, 102, 19, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawFallbackBody(ctx: CanvasRenderingContext2D, direction: FacingDirection) {
    const skin = '#f0be98';
    const hair = '#e7bf62';
    const shirt = '#f1ebdb';
    const pants = '#d7c2a1';
    const shoes = '#5d3626';
    const outline = '#3a2318';
    const laptop = '#3f4552';

    ctx.strokeStyle = outline;
    ctx.lineWidth = 2;

    if (direction === 'front' || direction === 'back') {
      const isFront = direction === 'front';
      this.fillRect(ctx, 24, 10, 24, 28, hair, outline);
      this.fillRect(ctx, 26, 18, 20, 18, skin, outline);
      if (isFront) {
        this.fillRect(ctx, 20, 20, 8, 6, '#253142', outline);
        this.fillRect(ctx, 44, 20, 8, 6, '#253142', outline);
      }
      this.fillRect(ctx, 24, 40, 24, 26, shirt, outline);
      this.fillRect(ctx, 22, 66, 28, 22, pants, outline);
      this.fillRect(ctx, 22, 40, 6, 36, skin, outline);
      this.fillRect(ctx, 44, 40, 6, 36, skin, outline);
      this.fillRect(ctx, 22, 50, 8, 18, laptop, outline);
      this.fillRect(ctx, 26, 88, 8, 14, pants, outline);
      this.fillRect(ctx, 38, 88, 8, 14, pants, outline);
      this.fillRect(ctx, 24, 100, 10, 6, shoes, outline);
      this.fillRect(ctx, 38, 100, 10, 6, shoes, outline);
      return;
    }

    const offsetX = 18;
    this.fillRect(ctx, offsetX, 10, 22, 28, hair, outline);
    this.fillRect(ctx, offsetX + 2, 18, 18, 18, skin, outline);
    this.fillRect(ctx, offsetX + 4, 20, 6, 6, '#253142', outline);
    this.fillRect(ctx, offsetX + 6, 40, 18, 26, shirt, outline);
    this.fillRect(ctx, offsetX + 8, 66, 16, 22, pants, outline);
    this.fillRect(ctx, 12, 52, 12, 24, laptop, outline);
    this.fillRect(ctx, offsetX + 4, 88, 8, 14, pants, outline);
    this.fillRect(ctx, offsetX + 14, 88, 8, 14, pants, outline);
    this.fillRect(ctx, offsetX + 2, 100, 10, 6, shoes, outline);
    this.fillRect(ctx, offsetX + 14, 100, 10, 6, shoes, outline);
  }

  private createFlippedLeftTexture() {
    const rightTextureKey = this.getTextureKeyForDirection('right');
    const leftTextureKey = this.getTextureKeyForDirection('left');

    if (!this.textures.exists(rightTextureKey) || this.textures.exists(leftTextureKey)) {
      return;
    }

    const rightTexture = this.textures.get(rightTextureKey);
    const source = rightTexture.getSourceImage() as HTMLCanvasElement | HTMLImageElement;
    const canvasTexture = this.textures.createCanvas(leftTextureKey, source.width, source.height);
    if (!canvasTexture) {
      return;
    }

    const ctx = canvasTexture.context;
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(source, -source.width, 0);
    ctx.restore();
    canvasTexture.refresh();
  }

  private fillRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    fill: string,
    stroke: string,
  ) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = stroke;
    ctx.strokeRect(x, y, width, height);
  }

  private readMovementInput() {
    if (this.isEditableElementFocused()) {
      return new Phaser.Math.Vector2(0, 0);
    }

    const left = this.arrowKeys.left.isDown;
    const right = this.arrowKeys.right.isDown;
    const up = this.arrowKeys.up.isDown;
    const down = this.arrowKeys.down.isDown;

    return new Phaser.Math.Vector2(
      Number(right) - Number(left),
      Number(down) - Number(up),
    );
  }

  private isEditableElementFocused() {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) {
      return false;
    }

    const tagName = active.tagName.toLowerCase();
    return (
      active.isContentEditable ||
      tagName === 'input' ||
      tagName === 'textarea' ||
      tagName === 'select'
    );
  }

  private updateFacingFromVelocity(movement: Phaser.Math.Vector2) {
    const nextDirection =
      Math.abs(movement.x) > Math.abs(movement.y)
        ? movement.x > 0
          ? 'right'
          : 'left'
        : movement.y > 0
          ? 'front'
          : 'back';

    if (nextDirection === this.facing) {
      return;
    }

    this.facing = nextDirection;
    this.actor.setTexture(this.getTextureKeyForDirection(this.facing));
  }

  private getTextureKeyForDirection(direction: FacingDirection) {
    return `office-worker-${direction}`;
  }
}

export type OfficeGameInstance = Phaser.Game;

export function createOfficeGame(parent: HTMLElement): OfficeGameInstance {
  return new Phaser.Game({
    type: Phaser.AUTO,
    width: 960,
    height: 600,
    parent,
    backgroundColor: '#122033',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [OfficeScene],
  });
}
