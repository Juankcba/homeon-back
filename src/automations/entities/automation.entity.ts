import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type TriggerType = 'schedule' | 'camera_motion' | 'face_recognized' | 'face_unknown' | 'vehicle_recognized' | 'vehicle_unknown' | 'device_state' | 'gate_opened' | 'gate_closed';
export type ActionType = 'open_gate' | 'close_gate' | 'turn_on_light' | 'turn_off_light' | 'set_scene' | 'send_notification' | 'record_event' | 'activate_alarm' | 'run_script';

@Entity('automations')
export class Automation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'jsonb' })
  trigger: {
    type: string;
    config: Record<string, any>;
    // schedule: { cron: string, days?: string[] }
    // camera_motion: { cameraId: string }
    // face_recognized: { faceId?: string }
    // vehicle_recognized: { vehicleId?: string }
  };

  @Column({ type: 'jsonb' })
  actions: Array<{
    type: string;
    config: Record<string, any>;
    // open_gate: { gateId?: string }
    // turn_on_light: { lightId?: string, groupId?: string }
    // set_scene: { sceneId: string }
    // send_notification: { channel: string, message?: string }
  }>;

  @Column({ type: 'jsonb', nullable: true })
  conditions: Array<{
    type: string;
    config: Record<string, any>;
    // time_range: { from: string, to: string }
    // day_of_week: { days: string[] }
  }>;

  @Column({ default: true })
  enabled: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastRunAt: Date;

  @Column({ default: 0 })
  runCount: number;

  @Column({ default: 0 })
  failCount: number;

  @Column({ default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
