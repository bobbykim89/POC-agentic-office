import type { AINewsDto } from "@agentic-office/shared-types";
import Phaser from "phaser";

type FacingDirection = "front" | "back" | "left" | "right";
type ZoneShape =
  | Phaser.Geom.Rectangle
  | Phaser.Geom.Polygon
  | Phaser.Geom.Ellipse;
type InteractionZone = {
  id: string;
  label: string;
  message: string;
  area: ZoneShape;
};
type DialogueContent = {
  title: string;
  body: string;
};

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
const CHARACTER_BOUNDS = new Phaser.Geom.Rectangle(30, 140, 1190, 650);
const DEBUG_ZONE_FILL_ALPHA = 0.12;
const DEBUG_ZONE_STROKE_ALPHA = 0.7;
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:3000";
const DIALOGUE_PAGE_MAX_CHARS = 350;
const BLOCKED_ZONES: ZoneShape[] = [
  // this is the main meeting room
  new Phaser.Geom.Rectangle(560, 230, 370, 80),
  new Phaser.Geom.Rectangle(550, 230, 30, 195),
  new Phaser.Geom.Rectangle(550, 420, 120, 50),
  new Phaser.Geom.Rectangle(760, 420, 170, 50),
  new Phaser.Geom.Polygon([1010, 365, 1010, 400, 930, 470, 930, 415]), // bottom angled wall
  new Phaser.Geom.Polygon([1010, 275, 1010, 345, 930, 310, 930, 230]), // top
  // table in main meeting room
  new Phaser.Geom.Rectangle(660, 330, 200, 60),
  // this is the computer room
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
  // table on elevator room
  new Phaser.Geom.Rectangle(1080, 490, 110, 40),
  // this is the windows on the corner
  new Phaser.Geom.Rectangle(1080, 205, 150, 70),
  new Phaser.Geom.Rectangle(1000, 110, 30, 100),
  new Phaser.Geom.Rectangle(1050, 200, 30, 50),
  // these are the general desks left row
  new Phaser.Geom.Rectangle(100, 495, 170, 60),
  new Phaser.Geom.Rectangle(100, 590, 170, 60),
  new Phaser.Geom.Rectangle(100, 690, 180, 60),
  // these are the general desks center row
  new Phaser.Geom.Rectangle(305, 495, 140, 60),
  new Phaser.Geom.Rectangle(300, 590, 140, 60),
  new Phaser.Geom.Rectangle(305, 690, 150, 60),
  // these are the general desks right row
  new Phaser.Geom.Rectangle(480, 495, 185, 60),
  new Phaser.Geom.Rectangle(490, 590, 175, 60),
  // this is the final desk at the right
  new Phaser.Geom.Rectangle(710, 495, 200, 60),
  // files on the bottom
  new Phaser.Geom.Rectangle(485, 690, 50, 60),
  new Phaser.Geom.Rectangle(560, 690, 50, 60),
  new Phaser.Geom.Rectangle(625, 690, 50, 60),
  // bottom walls
  new Phaser.Geom.Rectangle(30, 745, 650, 20),
  new Phaser.Geom.Rectangle(1010, 745, 250, 20),
  // oval tables
  new Phaser.Geom.Ellipse(1140, 300, 110, 50),
  new Phaser.Geom.Ellipse(1140, 365, 110, 50),
];
const INTERACTION_ZONES: InteractionZone[] = [
  {
    id: "newstand-panel",
    label: "Press E to browse newspapers",
    message:
      "You browse. through the news. This could later open something else...",
    area: new Phaser.Geom.Rectangle(1020, 570, 60, 100),
  },
  {
    id: "elevators",
    label: "Press E to check elevators",
    message: "ding!",
    area: new Phaser.Geom.Rectangle(1090, 570, 120, 100),
  },
  {
    id: "small-meeting-room-boards",
    label: "Press E to check wall",
    message: "some pretty decoration makes the meeting room cozy.",
    area: new Phaser.Geom.Rectangle(1060, 420, 130, 60),
  },
  {
    id: "meeting-room-whiteboard",
    label: "Press E to check whiteboard",
    message:
      "To-do list: 1. Finish frontend office prototype. 2. Add teammate NPC interactions. 3. Hook the newsstand to live AI news.",
    area: new Phaser.Geom.Rectangle(790, 250, 140, 70),
  },
  {
    id: "meeting-room-tv",
    label: "Press E to check tv and blackboard",
    message: "Some meeting just finished. I wonder what the summary was...",
    area: new Phaser.Geom.Rectangle(640, 250, 140, 70),
  },
  {
    id: "meeting-room-table",
    label: "Press E to check table",
    message: "Maybe I should join a meeting here.",
    area: new Phaser.Geom.Rectangle(650, 320, 220, 80),
  },
  {
    id: "outside-view-top",
    label: "Press E to check view",
    message: "Woah! The Phoenix skyline is so beautiful!",
    area: new Phaser.Geom.Rectangle(1010, 60, 220, 90),
  },
  {
    id: "outside-view-right",
    label: "Press E to check view",
    message: "Woah! The Phoenix skyline is so beautiful!",
    area: new Phaser.Geom.Rectangle(1210, 60, 40, 200),
  },
  {
    id: "vending-machine",
    label: "Press E to check vending machine",
    message:
      "The vending machine has a wide assortment of delicious beverages and snacks...",
    area: new Phaser.Geom.Rectangle(820, 50, 45, 90),
  },
  {
    id: "coffee-maker",
    label: "Press E to check coffee maker",
    message: "The coffee brewing smells so delicious...",
    area: new Phaser.Geom.Rectangle(760, 50, 45, 90),
  },
  {
    id: "video-room",
    label: "Press E to check video table",
    message: "Lots of modern cameras and tech...",
    area: new Phaser.Geom.Rectangle(450, 100, 60, 60),
  },
  {
    id: "x-lab-left",
    label: "Press E to check x-lab computers",
    message: "Some fun looking games are being developed...",
    area: new Phaser.Geom.Rectangle(170, 100, 95, 50),
  },
  {
    id: "x-lab-right",
    label: "Press E to check x-lab computers",
    message: "Some fun looking games are being developed...",
    area: new Phaser.Geom.Rectangle(290, 100, 95, 50),
  },
  {
    id: "main-computers-top",
    label: "Press E to check main computers",
    message: "Some really big screens! I could do my work here.",
    area: new Phaser.Geom.Rectangle(170, 220, 180, 80),
  },
  {
    id: "main-computers-bottom",
    label: "Press E to check main computers",
    message: "Some really big screens! I could do my work here.",
    area: new Phaser.Geom.Rectangle(160, 330, 220, 70),
  },
  {
    id: "wall-art-hallway",
    label: "Press E to check art",
    message: "Such pretty art!",
    area: new Phaser.Geom.Rectangle(190, 430, 165, 55),
  },
  {
    id: "file-cabinets",
    label: "Press E to check filing cabinets",
    message: "Some realy interesting documents are hidden here.",
    area: new Phaser.Geom.Rectangle(490, 680, 190, 70),
  },
];
const INITIAL_ACTOR_POSITION = new Phaser.Math.Vector2(710, 460);
const TARGET_ACTOR_HEIGHT = 108;

class OfficeScene extends Phaser.Scene {
  private arrowKeys!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };
  private interactKey!: Phaser.Input.Keyboard.Key;
  private actor!: Phaser.GameObjects.Image;
  private promptText!: Phaser.GameObjects.Text;
  private dialogueBox!: Phaser.GameObjects.Rectangle;
  private dialogueTitleText!: Phaser.GameObjects.Text;
  private dialogueBodyText!: Phaser.GameObjects.Text;
  private dialogueHintText!: Phaser.GameObjects.Text;
  private facing: FacingDirection = "front";
  private actorVelocity = new Phaser.Math.Vector2(0, 0);
  private activeInteractionZone: InteractionZone | null = null;
  private dialogueOpen = false;
  private interactionBusy = false;
  private dialogueZoneId: string | null = null;
  private dialoguePages: string[] = [];
  private dialoguePageIndex = 0;
  private dialogueHintEnabled = true;

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
    this.interactKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.E,
    );
    this.promptText = this.add
      .text(36, 34, "", {
        color: "#dff1ff",
        fontFamily: "Avenir Next, sans-serif",
        fontSize: "22px",
        fontStyle: "bold",
        backgroundColor: "rgba(20, 32, 46, 0.78)",
        padding: { x: 12, y: 8 },
      })
      .setDepth(20)
      .setVisible(false);
    this.dialogueBox = this.add
      .rectangle(
        GAME_WIDTH / 2,
        GAME_HEIGHT - 112,
        GAME_WIDTH - 48,
        168,
        0xf8f9ff,
        0.96,
      )
      .setStrokeStyle(6, 0x2f4f78, 1)
      .setDepth(30)
      .setVisible(false);
    this.dialogueTitleText = this.add
      .text(52, GAME_HEIGHT - 178, "", {
        color: "#1f3956",
        fontFamily: "Avenir Next, sans-serif",
        fontSize: "18px",
        fontStyle: "bold",
      })
      .setDepth(31)
      .setVisible(false);
    this.dialogueBodyText = this.add
      .text(52, GAME_HEIGHT - 148, "", {
        color: "#213247",
        fontFamily: "Avenir Next, sans-serif",
        fontSize: "22px",
        wordWrap: { width: GAME_WIDTH - 112 },
        lineSpacing: 8,
      })
      .setDepth(31)
      .setVisible(false);
    this.dialogueHintText = this.add
      .text(36, 70, "Press E to close", {
        color: "#dff1ff",
        fontFamily: "Avenir Next, sans-serif",
        fontSize: "18px",
        fontStyle: "bold",
        backgroundColor: "rgba(20, 32, 46, 0.78)",
        padding: { x: 12, y: 8 },
      })
      .setDepth(20)
      .setVisible(false);
  }

  update(_: number, delta: number) {
    if (this.dialogueOpen && Phaser.Input.Keyboard.JustDown(this.interactKey)) {
      this.advanceDialogue();
      return;
    }

    const elapsed = delta / 1000;
    const movement = this.readMovementInput();

    this.actorVelocity.copy(movement);
    if (this.actorVelocity.lengthSq() > 0) {
      this.actorVelocity.normalize().scale(MOVE_SPEED * elapsed);
      this.moveActor(this.actorVelocity.x, this.actorVelocity.y);
      this.updateFacingFromVelocity(movement);
    }

    this.updateInteractionState();
  }

  private createBackdrop() {
    this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, BACKDROP_KEY)
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);

    this.drawDebugZone(CHARACTER_BOUNDS, 0x86a4bf, 0x000000, 0);
    BLOCKED_ZONES.forEach((zone) => {
      this.drawDebugZone(zone, 0x86a4bf, 0x86a4bf, DEBUG_ZONE_FILL_ALPHA);
    });
    INTERACTION_ZONES.forEach((zone) => {
      this.drawDebugZone(zone.area, 0x6dd3ff, 0x6dd3ff, DEBUG_ZONE_FILL_ALPHA);
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
    return !BLOCKED_ZONES.some((zone) => this.zoneContains(zone, x, y));
  }

  private drawDebugZone(
    zone: ZoneShape,
    strokeColor: number,
    fillColor: number,
    fillAlpha: number,
  ) {
    if (zone instanceof Phaser.Geom.Rectangle) {
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
      return;
    }

    if (zone instanceof Phaser.Geom.Ellipse) {
      this.add
        .ellipse(zone.x, zone.y, zone.width, zone.height, fillColor, fillAlpha)
        .setStrokeStyle(3, strokeColor, DEBUG_ZONE_STROKE_ALPHA);
      return;
    }

    this.add
      .polygon(0, 0, zone.points, fillColor, fillAlpha)
      .setOrigin(0, 0)
      .setStrokeStyle(3, strokeColor, DEBUG_ZONE_STROKE_ALPHA);
  }

  private zoneContains(zone: ZoneShape, x: number, y: number) {
    if (zone instanceof Phaser.Geom.Rectangle) {
      return zone.contains(x, y);
    }

    if (zone instanceof Phaser.Geom.Ellipse) {
      return zone.contains(x, y);
    }

    return zone.contains(x, y);
  }

  private updateInteractionState() {
    const zone =
      INTERACTION_ZONES.find((candidate) =>
        this.zoneContains(candidate.area, this.actor.x, this.actor.y),
      ) ?? null;

    if (
      this.dialogueOpen &&
      this.dialogueZoneId &&
      zone?.id !== this.dialogueZoneId
    ) {
      this.hideDialogue();
    }

    this.activeInteractionZone = zone;
    this.promptText.setVisible(
      Boolean(zone) && !this.dialogueOpen && !this.interactionBusy,
    );
    this.promptText.setText(zone?.label ?? "");

    if (!zone || this.dialogueOpen || this.interactionBusy) {
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
      void this.handleInteraction(zone);
    }
  }

  private async handleInteraction(zone: InteractionZone) {
    this.interactionBusy = true;

    try {
      if (zone.id === "newstand-panel") {
        this.showLoadingDialogue(
          {
            title: "Newsstand",
            body: "There should be some interesting news on this newsstand...",
          },
          zone.id,
        );

        const news = await this.fetchAINews();
        this.showDialogue(
          {
            title: `${news.source} | ${news.title}`,
            body: news.paragraph,
          },
          zone.id,
        );
        return;
      }

      this.showDialogue(
        {
          title: this.formatInteractionTitle(zone.id),
          body: zone.message,
        },
        zone.id,
      );
    } catch (error) {
      this.showDialogue(
        {
          title: "Newsstand",
          body: "Nothing new or relevant on the news right now.",
        },
        zone.id,
      );
    } finally {
      this.interactionBusy = false;
    }
  }

  private async fetchAINews(): Promise<AINewsDto> {
    const response = await fetch(`${BACKEND_URL}/office/newsstand`);
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}.`);
    }

    return (await response.json()) as AINewsDto;
  }

  private showDialogue(content: DialogueContent, zoneId?: string) {
    this.dialogueOpen = true;
    this.dialogueZoneId = zoneId ?? null;
    this.dialoguePages = this.paginateDialogue(content.body);
    this.dialoguePageIndex = 0;
    this.dialogueHintEnabled = true;
    this.dialogueTitleText.setText(content.title);
    this.dialogueBox.setVisible(true);
    this.dialogueTitleText.setVisible(true);
    this.dialogueBodyText.setVisible(true);
    this.promptText.setVisible(false);
    this.renderDialoguePage();
  }

  private hideDialogue() {
    this.dialogueOpen = false;
    this.dialogueZoneId = null;
    this.dialoguePages = [];
    this.dialoguePageIndex = 0;
    this.dialogueHintEnabled = true;
    this.dialogueBox.setVisible(false);
    this.dialogueTitleText.setVisible(false);
    this.dialogueBodyText.setVisible(false);
    this.dialogueHintText.setVisible(false);
  }

  private advanceDialogue() {
    if (this.dialoguePageIndex < this.dialoguePages.length - 1) {
      this.dialoguePageIndex += 1;
      this.renderDialoguePage();
      return;
    }

    this.hideDialogue();
  }

  private renderDialoguePage() {
    const page = this.dialoguePages[this.dialoguePageIndex] ?? "";
    this.dialogueBodyText.setText(page);

    if (!this.dialogueHintEnabled) {
      this.dialogueHintText.setVisible(false);
      return;
    }

    this.dialogueHintText.setVisible(true);

    if (
      this.dialoguePages.length > 1 &&
      this.dialoguePageIndex < this.dialoguePages.length - 1
    ) {
      this.dialogueHintText.setText("Press E for more");
      return;
    }

    this.dialogueHintText.setText("Press E to close");
  }

  private paginateDialogue(body: string) {
    const normalized = body.replace(/\s+/g, " ").trim();
    if (normalized.length <= DIALOGUE_PAGE_MAX_CHARS) {
      return [normalized];
    }

    const pages: string[] = [];
    let remaining = normalized;

    while (remaining.length > DIALOGUE_PAGE_MAX_CHARS) {
      let splitAt = remaining.lastIndexOf(" ", DIALOGUE_PAGE_MAX_CHARS);
      if (splitAt <= 0) {
        splitAt = DIALOGUE_PAGE_MAX_CHARS;
      }

      pages.push(remaining.slice(0, splitAt).trim());
      remaining = remaining.slice(splitAt).trim();
    }

    if (remaining.length > 0) {
      pages.push(remaining);
    }

    return pages;
  }

  private showLoadingDialogue(content: DialogueContent, zoneId?: string) {
    this.showDialogue(content, zoneId);
    this.dialogueHintEnabled = false;
    this.dialogueHintText.setVisible(false);
  }

  private formatInteractionTitle(id: string) {
    return id
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  private readMovementInput() {
    if (this.interactionBusy || this.isEditableElementFocused()) {
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
