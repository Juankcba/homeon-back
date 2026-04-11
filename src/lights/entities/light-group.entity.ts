import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('light_groups')
export class LightGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  hueGroupId: string;

  @Column({ type: 'simple-array' })
  lightIds: string[];

  @Column({ default: false })
  on: boolean;

  @Column({ default: 254 })
  brightness: number;

  @Column({ nullable: true })
  room: string;

  @Column({ nullable: true })
  floor: string;

  @Column({ nullable: true })
  icon: string;

  @Column({ default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
