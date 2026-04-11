import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * Stores integration configuration for hardware devices.
 * IP addresses, API keys, and connection info live HERE, not in .env.
 *
 * type examples: 'hue-bridge', 'tapo-camera', 'gate-controller'
 */
@Entity('device_configs')
export class DeviceConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Integration type identifier */
  @Column({ unique: true })
  type: string;

  /** Human label */
  @Column({ nullable: true })
  label: string;

  /** IP address of the device */
  @Column({ nullable: true })
  ip: string;

  /** API key / username / token for authentication */
  @Column({ nullable: true })
  apiKey: string;

  /** Additional config as JSON (port, mac, model, etc.) */
  @Column({ type: 'jsonb', default: {} })
  meta: Record<string, any>;

  /** Is this integration currently active / connected? */
  @Column({ default: false })
  connected: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
