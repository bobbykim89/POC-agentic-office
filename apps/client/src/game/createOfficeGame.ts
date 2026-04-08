import Phaser from "phaser";

type FacingDirection = "front" | "back" | "left" | "right";

const GAME_WIDTH = 1280;
const GAME_HEIGHT = 800;
const BACKDROP_KEY = "office-map";
const BACKDROP_PATH = "/maps/background-office-map.png";
const EXTERNAL_SPRITE_SHEET_KEY = "office-worker-sheet";
const EXTERNAL_SPRITE_SHEET_PATH = "/sprites/office-worker-directions.png";
const SHEET_DIRECTION_ORDER: Array<Exclude<FacingDirection, "left">> = [
  "front",
  "back",
  "right",
];
const FALLBACK_FRAME_WIDTH = 72;
const FALLBACK_FRAME_HEIGHT = 108;
const MOVE_SPEED = 220;
const CHARACTER_BOUNDS = new Phaser.Geom.Rectangle(30, 140, 1200, 650);
const DEBUG_ZONE_FILL_ALPHA = 0.12;
const DEBUG_ZONE_STROKE_ALPHA = 0.7;
const BLOCKED_ZONES = [
  // this is the main meeting room
  new Phaser.Geom.Rectangle(560, 230, 370, 80),
  new Phaser.Geom.Rectangle(550, 230, 30, 195),
  new Phaser.Geom.Rectangle(550, 420, 120, 50),
  new Phaser.Geom.Rectangle(760, 420, 170, 50),
  // this is the computer rooms
  new Phaser.Geom.Rectangle(135, 110, 30, 320),
  new Phaser.Geom.Rectangle(135, 180, 215, 110),
  new Phaser.Geom.Rectangle(135, 330, 250, 60),
  new Phaser.Geom.Rectangle(135, 420, 250, 60),
  // this is the video room
  new Phaser.Geom.Rectangle(377, 110, 30, 90),
  new Phaser.Geom.Rectangle(555, 110, 30, 90),
  // this is the elevator
  new Phaser.Geom.Rectangle(1015, 405, 220, 70),
  new Phaser.Geom.Rectangle(1015, 405, 25, 90),
  new Phaser.Geom.Rectangle(1015, 520, 25, 90),
  new Phaser.Geom.Rectangle(1015, 560, 220, 90),
];
const INITIAL_ACTOR_POSITION = new Phaser.Math.Vector2(640, 560);
const TARGET_ACTOR_HEIGHT = 108;

class OfficeScene extends Phaser.Scene {
  private arrowKeys!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };
  private actor!: Phaser.GameObjects.Image;
  private facing: FacingDirection = "front";
  private actorVelocity = new Phaser.Math.Vector2(0, 0);

  constructor() {
    super("office-scene");
  }

  preload() {
    this.load.image(BACKDROP_KEY, BACKDROP_PATH);
    this.load.image(EXTERNAL_SPRITE_SHEET_KEY, EXTERNAL_SPRITE_SHEET_PATH);
  }

  create() {
    this.cameras.main.setBackgroundColor("#122033");
    this.createBackdrop();
    this.createDirectionalTextures();

    this.actor = this.add
      .image(
        INITIAL_ACTOR_POSITION.x,
        INITIAL_ACTOR_POSITION.y,
        this.getTextureKeyForDirection(this.facing),
      )
      .setOrigin(0.5, 1);

    const actorTexture = this.textures.get(
      this.getTextureKeyForDirection(this.facing),
    );
    const actorSource = actorTexture.getSourceImage() as
      | HTMLCanvasElement
      | HTMLImageElement;
    this.actor.setScale(TARGET_ACTOR_HEIGHT / actorSource.height);

    this.input.keyboard?.disableGlobalCapture();
    this.arrowKeys = this.input.keyboard!.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
    }) as OfficeScene["arrowKeys"];
  }

  update(_: number, delta: number) {
    const elapsed = delta / 1000;
    const movement = this.readMovementInput();

    this.actorVelocity.copy(movement);
    if (this.actorVelocity.lengthSq() > 0) {
      this.actorVelocity.normalize().scale(MOVE_SPEED * elapsed);
      this.moveActor(this.actorVelocity.x, this.actorVelocity.y);
      this.updateFacingFromVelocity(movement);
    }
  }

  private createBackdrop() {
    this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, BACKDROP_KEY)
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);

    this.drawDebugZone(CHARACTER_BOUNDS, 0x86a4bf, 0x000000, 0);
    BLOCKED_ZONES.forEach((zone) => {
      this.drawDebugZone(zone, 0x86a4bf, 0x86a4bf, DEBUG_ZONE_FILL_ALPHA);
    });
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

      const canvasTexture = this.textures.createCanvas(
        textureKey,
        frameWidth,
        frameHeight,
      );
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
    (["front", "back", "right"] as const).forEach((direction) => {
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
    ctx.fillStyle = "rgba(8, 15, 26, 0.24)";
    ctx.beginPath();
    ctx.ellipse(36, 102, 19, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawFallbackBody(
    ctx: CanvasRenderingContext2D,
    direction: FacingDirection,
  ) {
    const skin = "#f0be98";
    const hair = "#e7bf62";
    const shirt = "#f1ebdb";
    const pants = "#d7c2a1";
    const shoes = "#5d3626";
    const outline = "#3a2318";
    const laptop = "#3f4552";

    ctx.strokeStyle = outline;
    ctx.lineWidth = 2;

    if (direction === "front" || direction === "back") {
      const isFront = direction === "front";
      this.fillRect(ctx, 24, 10, 24, 28, hair, outline);
      this.fillRect(ctx, 26, 18, 20, 18, skin, outline);
      if (isFront) {
        this.fillRect(ctx, 20, 20, 8, 6, "#253142", outline);
        this.fillRect(ctx, 44, 20, 8, 6, "#253142", outline);
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
    this.fillRect(ctx, offsetX + 4, 20, 6, 6, "#253142", outline);
    this.fillRect(ctx, offsetX + 6, 40, 18, 26, shirt, outline);
    this.fillRect(ctx, offsetX + 8, 66, 16, 22, pants, outline);
    this.fillRect(ctx, 12, 52, 12, 24, laptop, outline);
    this.fillRect(ctx, offsetX + 4, 88, 8, 14, pants, outline);
    this.fillRect(ctx, offsetX + 14, 88, 8, 14, pants, outline);
    this.fillRect(ctx, offsetX + 2, 100, 10, 6, shoes, outline);
    this.fillRect(ctx, offsetX + 14, 100, 10, 6, shoes, outline);
  }

  private createFlippedLeftTexture() {
    const rightTextureKey = this.getTextureKeyForDirection("right");
    const leftTextureKey = this.getTextureKeyForDirection("left");

    if (
      !this.textures.exists(rightTextureKey) ||
      this.textures.exists(leftTextureKey)
    ) {
      return;
    }

    const rightTexture = this.textures.get(rightTextureKey);
    const source = rightTexture.getSourceImage() as
      | HTMLCanvasElement
      | HTMLImageElement;
    const canvasTexture = this.textures.createCanvas(
      leftTextureKey,
      source.width,
      source.height,
    );
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

  private moveActor(deltaX: number, deltaY: number) {
    const nextX = Phaser.Math.Clamp(
      this.actor.x + deltaX,
      CHARACTER_BOUNDS.left,
      CHARACTER_BOUNDS.right,
    );
    if (this.canOccupy(nextX, this.actor.y)) {
      this.actor.x = nextX;
    }

    const nextY = Phaser.Math.Clamp(
      this.actor.y + deltaY,
      CHARACTER_BOUNDS.top,
      CHARACTER_BOUNDS.bottom,
    );
    if (this.canOccupy(this.actor.x, nextY)) {
      this.actor.y = nextY;
    }
  }

  private canOccupy(x: number, y: number) {
    return !BLOCKED_ZONES.some((zone) => zone.contains(x, y));
  }

  private drawDebugZone(
    zone: Phaser.Geom.Rectangle,
    strokeColor: number,
    fillColor: number,
    fillAlpha: number,
  ) {
    this.add
      .rectangle(
        zone.centerX,
        zone.centerY,
        zone.width,
        zone.height,
        fillColor,
        fillAlpha,
      )
      .setStrokeStyle(3, strokeColor, DEBUG_ZONE_STROKE_ALPHA);
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
      tagName === "input" ||
      tagName === "textarea" ||
      tagName === "select"
    );
  }

  private updateFacingFromVelocity(movement: Phaser.Math.Vector2) {
    const nextDirection =
      Math.abs(movement.x) > Math.abs(movement.y)
        ? movement.x > 0
          ? "right"
          : "left"
        : movement.y > 0
          ? "front"
          : "back";

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
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    parent,
    backgroundColor: "#122033",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [OfficeScene],
  });
}
