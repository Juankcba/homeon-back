import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('authorized_vehicles')
export class AuthorizedVehicle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  plate: string;

  @Column({ nullable: true })
  owner: string;

  @Column({ nullable: true })
  userId: string;

  @Column({ default: 'auto' })
  type: string; // auto, moto, camion

  @Column({ nullable: true })
  brand: string;

  @Column({ nullable: true })
  model: string;

  @Column({ nullable: true })
  color: string;

  @Column({ default: 0 })
  totalDetections: number;

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
