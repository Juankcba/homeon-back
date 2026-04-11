import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('authorized_faces')
export class AuthorizedFace {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: ['admin', 'family', 'guest', 'staff'], default: 'family' })
  role: string;

  @Column({ nullable: true })
  userId: string;

  @Column({ type: 'bytea', nullable: true })
  encoding: Buffer; // face encoding vector

  @Column({ nullable: true })
  photoPath: string;

  @Column({ default: 0 })
  totalDetections: number;

  @Column({ type: 'decimal', default: 0 })
  avgConfidence: number;

  @Column({ type: 'timestamp', nullable: true })
  lastSeenAt: Date;

  @Column({ nullable: true })
  lastSeenCamera: string;

  @Column({ default: true })
  gateAccess: boolean;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
