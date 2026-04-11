import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type GateActionType = 'open' | 'close';
export type GateMethod = 'manual_app' | 'automatic' | 'face_recognition' | 'plate_recognition' | 'schedule' | 'api';

@Entity('gate_actions')
@Index(['timestamp'])
@Index(['userId', 'timestamp'])
export class GateAction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: ['open', 'close'] })
  action: GateActionType;

  @Column({ type: 'enum', enum: ['manual_app', 'automatic', 'face_recognition', 'plate_recognition', 'schedule', 'api'], default: 'manual_app' })
  method: GateMethod;

  @Column({ nullable: true })
  userId: string;

  @Column({ nullable: true })
  userName: string;

  @Column({ nullable: true })
  ipAddress: string;

  @Column({ nullable: true })
  detail: string;

  @Column({ default: true })
  success: boolean;

  @CreateDateColumn()
  timestamp: Date;
}
