import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('light_scenes')
export class LightScene {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  hueSceneId: string;

  @Column({ nullable: true })
  icon: string;

  @Column({ type: 'jsonb', default: {} })
  lightStates: Record<string, {
    on?: boolean;
    brightness?: number;
    color?: { hue: number; saturation: number };
    colorTemp?: number;
  }>;

  @Column({ default: false })
  isActive: boolean;

  @Column({ default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
