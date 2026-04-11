import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type DetectionType = 'face' | 'vehicle' | 'person' | 'motion';

@Entity('detections')
@Index(['type', 'timestamp'])
@Index(['cameraId', 'timestamp'])
@Index(['authorized', 'timestamp'])
export class Detection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: ['face', 'vehicle', 'person', 'motion'] })
  type: DetectionType;

  @Column()
  label: string; // e.g. "Juan", "ABC 123", "Desconocido"

  @Column()
  cameraId: string;

  @Column({ nullable: true })
  cameraName: string;

  @Column({ type: 'decimal', default: 0 })
  confidence: number;

  @Column({ default: false })
  authorized: boolean;

  @Column({ nullable: true })
  matchedFaceId: string;

  @Column({ nullable: true })
  matchedVehicleId: string;

  @Column({ nullable: true })
  snapshotPath: string;

  @Column({ type: 'jsonb', nullable: true })
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ default: false })
  alertSent: boolean;

  @Column({ nullable: true })
  triggeredAutomationId: string;

  @CreateDateColumn()
  timestamp: Date;
}
