import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type PlateFormat = 'old' | 'mercosur' | 'unknown';

@Entity('authorized_vehicles')
export class AuthorizedVehicle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  plate: string;

  @Column({
    type: 'varchar',
    default: 'unknown',
  })
  plateFormat: PlateFormat; // old (ABC 123), mercosur (AB 123 CD), unknown

  @Column({ nullable: true })
  owner: string;

  @Column({ nullable: true })
  userId: string;

  @Column({ default: 'auto' })
  type: string; // auto, moto, camion, camioneta

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
