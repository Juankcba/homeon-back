import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type EventSeverity = 'critical' | 'warning' | 'info' | 'success';
export type EventType = 'motion' | 'face' | 'vehicle' | 'unknown_person' | 'gate' | 'light' | 'automation' | 'security' | 'system' | 'offline' | 'camera';

@Entity('events')
@Index(['type', 'timestamp'])
@Index(['cameraId', 'timestamp'])
@Index(['severity', 'timestamp'])
@Index(['timestamp'])
export class Event {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  type: string;

  @Column({ type: 'enum', enum: ['critical', 'warning', 'info', 'success'], default: 'info' })
  severity: EventSeverity;

  @Column()
  message: string;

  @Column({ type: 'text', nullable: true })
  detail: string;

  @Column({ nullable: true })
  cameraId: string;

  @Column({ nullable: true })
  cameraName: string;

  @Column({ nullable: true })
  userId: string;

  @Column({ nullable: true })
  userName: string;

  @Column({ nullable: true })
  deviceId: string;

  @Column({ nullable: true })
  snapshotPath: string;

  @Column({ nullable: true })
  detectionId: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ default: false })
  acknowledged: boolean;

  @CreateDateColumn()
  timestamp: Date;
}
