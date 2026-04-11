import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';

export type CameraStatus = 'online' | 'offline' | 'recording';

@Entity('cameras')
export class Camera {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  location: string;

  @Column({ type: 'enum', enum: ['online', 'offline', 'recording'], default: 'offline' })
  status: CameraStatus;

  @Column()
  ip: string;

  @Column({ nullable: true })
  mac: string;

  @Column({ default: 'Tapo C320WS' })
  model: string;

  @Column({ nullable: true })
  firmware: string;

  @Column({ default: '1920x1080' })
  resolution: string;

  @Column({ default: 25 })
  fps: number;

  @Column({ nullable: true })
  codec: string;

  @Column({ default: 'exterior' })
  zone: string;

  @Column({ type: 'jsonb', default: { nightVision: true, audio: true, motionDetection: true } })
  features: {
    nightVision: boolean;
    audio: boolean;
    motionDetection: boolean;
  };

  @Column({ type: 'decimal', default: 0 })
  storageUsed: number;

  @Column({ type: 'decimal', default: 1000 })
  storageTotal: number;

  @Column({ type: 'bigint', default: 0 })
  uptime: number;

  @Column({ type: 'decimal', nullable: true })
  temperature: number;

  @Column({ type: 'timestamp', nullable: true })
  lastMotion: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastPing: Date;

  /** RTSP / stream credentials (set per-camera in Tapo app → Camera Account) */
  @Column({ nullable: true })
  rtspUsername: string;

  @Column({ nullable: true })
  rtspPassword: string;

  /** Legacy cloud credentials override (optional) */
  @Column({ type: 'jsonb', nullable: true })
  credentials: {
    username?: string;
    password?: string;
  };

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
