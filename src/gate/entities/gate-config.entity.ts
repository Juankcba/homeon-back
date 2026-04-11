import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('gate_config')
export class GateConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: 'Portón Principal' })
  name: string;

  @Column({ type: 'enum', enum: ['open', 'closed', 'opening', 'closing'], default: 'closed' })
  status: 'open' | 'closed' | 'opening' | 'closing';

  @Column({ default: 0 })
  position: number; // 0 = closed, 100 = open

  @Column({ default: true })
  autoCloseEnabled: boolean;

  @Column({ default: 180 })
  autoCloseSeconds: number;

  @Column({ default: true })
  doubleConfirmation: boolean;

  @Column({ default: false })
  restrictedHours: boolean;

  @Column({ type: 'time', nullable: true })
  restrictedFrom: string;

  @Column({ type: 'time', nullable: true })
  restrictedTo: string;

  @Column({ default: true })
  faceRecognitionAccess: boolean;

  @Column({ default: true })
  plateRecognitionAccess: boolean;

  @Column({ nullable: true })
  controllerIp: string;

  @Column({ nullable: true })
  controllerPort: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
