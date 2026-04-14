import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Physical edge device (ESP32-C6 with 1.47" LCD) paired with the cloud
 * backend. Acts as a LAN bridge – the backend sends LAN HTTP requests
 * over a persistent WSS connection and the ESP replies with the response.
 */
@Entity('edge_devices')
export class EdgeDevice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  product: string;

  @Column({ nullable: true })
  version: string;

  @Index({ unique: true })
  @Column()
  mac: string;

  /** Long-lived bearer token the device sends in WS Authorization header. */
  @Index({ unique: true })
  @Column({ type: 'text' })
  token: string;

  @Column({ default: false })
  connected: boolean;

  @Column({ nullable: true })
  lastIp: string;

  @Column({ nullable: true })
  lastRssi: number;

  @Column({ type: 'timestamp', nullable: true })
  lastSeenAt: Date;

  // ─── Location (used for the weather card on the LCD) ──────────────────────
  @Column({ nullable: true })
  locationName: string;

  @Column({ type: 'double precision', nullable: true })
  latitude: number;

  @Column({ type: 'double precision', nullable: true })
  longitude: number;

  @Column({ nullable: true })
  timezone: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
