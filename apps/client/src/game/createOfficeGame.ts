import Phaser from 'phaser';

class OfficeScene extends Phaser.Scene {
  constructor() {
    super('office-scene');
  }

  create() {
    this.cameras.main.setBackgroundColor('#122033');

    this.add
      .text(40, 40, 'Agentic Office', {
        color: '#f8f3e7',
        fontFamily: 'Georgia',
        fontSize: '32px',
      })
      .setShadow(2, 2, '#000000', 4, false, true);

    this.add.text(40, 92, 'Phaser scene mounted inside Vue 3', {
      color: '#c9d8e8',
      fontFamily: 'Arial',
      fontSize: '18px',
    });

    const desk = this.add.rectangle(280, 250, 360, 120, 0xc2874f);
    desk.setStrokeStyle(4, 0x8e5e36);

    const orb = this.add.circle(280, 205, 28, 0x79d0ff);
    this.tweens.add({
      targets: orb,
      y: 190,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
    });
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
