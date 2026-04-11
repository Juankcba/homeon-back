import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('lights')
export class Light {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  hueId: string;

  @Column({ default: false })
  on: boolean;

  @Column({ default: 254 })
  brightness: number;

  @Column({ type: 'jsonb', nullable: true })
  color: {
    hue: number;
    saturation: number;
    xy: [number, number];
  };

  @Column({ type: 'int', nullable: true })
  colorTemp: number;

  @Column({ nullable: true })
  room: string;

  @Column({ nullable: true })
  floor: string;

  @Column({ nullable: true })
  type: string; // e.g. "Extended color light", "Color temperature light"

  @Column({ default: true })
  reachable: boolean;

  @Column({ default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
