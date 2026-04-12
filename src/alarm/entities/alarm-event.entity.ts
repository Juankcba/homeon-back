import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export type AlarmEventType =
  | 'mode_change'    // arm, disarm, home
  | 'alarm_triggered'
  | 'alarm_cleared'
  | 'sensor_trigger' // door/window sensor, PIR, etc.
  | 'tamper'
  | 'battery_low'
  | 'offline'
  | 'online';

@Entity('alarm_events')
export class AlarmEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK to alarm */
  @Column()
  alarmId: string;

  @Column()
  type: AlarmEventType;

  /** Human-readable description */
  @Column()
  message: string;

  /** Previous / new values, sensor codes, etc. */
  @Column({ type: 'jsonb', nullable: true })
  detail: Record<string, any>;

  /** Who triggered it: 'system', 'user:juan', 'automation:x' */
  @Column({ nullable: true })
  triggeredBy: string;

  @CreateDateColumn()
  timestamp: Date;
}
