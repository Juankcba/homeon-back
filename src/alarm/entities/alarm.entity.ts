import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AlarmMode = 'arm' | 'disarm' | 'home' | 'sos' | 'unknown';

@Entity('alarms')
export class Alarm {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Display name, e.g. "Alarma Principal" */
  @Column()
  name: string;

  /** Tuya device ID */
  @Column({ unique: true })
  tuyaDeviceId: string;

  /** Tuya product name / model */
  @Column({ nullable: true })
  model: string;

  /** Current mode: arm, disarm, home, sos */
  @Column({ default: 'unknown' })
  mode: AlarmMode;

  /** Whether the siren/alarm is currently triggered */
  @Column({ default: false })
  alarmActive: boolean;

  /** Device online/offline */
  @Column({ default: false })
  online: boolean;

  /** Battery percentage (null if mains-powered) */
  @Column({ type: 'decimal', nullable: true })
  battery: number;

  /** Zone / location label */
  @Column({ default: 'general' })
  zone: string;

  /** Tuya local key (for LAN control via tinytuya) */
  @Column({ nullable: true })
  localKey: string;

  /** Device local IP on the LAN */
  @Column({ nullable: true })
  localIp: string;

  /** Extra Tuya DPs and sensor data */
  @Column({ type: 'jsonb', default: {} })
  sensors: Record<string, any>;

  /** Last time status was synced from Tuya */
  @Column({ type: 'timestamp', nullable: true })
  lastSyncAt: Date;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
