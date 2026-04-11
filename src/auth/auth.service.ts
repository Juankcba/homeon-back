import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User, UserRole } from './entities/user.entity';

interface LoginPayload {
  username: string;
  password: string;
}

interface RegisterPayload {
  username: string;
  password: string;
  name: string;
  email?: string;
  role?: UserRole;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async onModuleInit() {
    // Seed default admin user if no users exist
    const count = await this.usersRepository.count();
    if (count === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await this.usersRepository.save({
        username: 'admin',
        password: hashedPassword,
        name: 'Juan',
        email: 'juan@homeon.local',
        role: 'admin' as UserRole,
      });
      console.log('✅ Default admin user created (admin / admin123)');
    }
  }

  async validateUser(username: string, password: string): Promise<any> {
    const user = await this.usersRepository.findOne({
      where: { username, isActive: true },
    });
    if (user && (await bcrypt.compare(password, user.password))) {
      const { password: _, mfaSecret: __, ...result } = user;
      return result;
    }
    return null;
  }

  async login(loginPayload: LoginPayload) {
    const user = await this.validateUser(loginPayload.username, loginPayload.password);
    if (!user) {
      return null;
    }

    // Update last login
    await this.usersRepository.update(user.id, { lastLoginAt: new Date() });

    const payload = { sub: user.id, username: user.username, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      refresh_token: this.jwtService.sign(payload, { expiresIn: '7d' }),
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  async register(registerPayload: RegisterPayload) {
    const existingUser = await this.usersRepository.findOne({
      where: { username: registerPayload.username },
    });
    if (existingUser) {
      throw new UnauthorizedException('Username already exists');
    }

    const hashedPassword = await bcrypt.hash(registerPayload.password, 10);
    const user = await this.usersRepository.save({
      ...registerPayload,
      password: hashedPassword,
      role: registerPayload.role || 'family',
    });

    const { password: _, ...result } = user;
    return result;
  }

  async refreshToken(refresh_token: string) {
    try {
      const decoded = this.jwtService.verify(refresh_token);
      const user = await this.usersRepository.findOne({
        where: { id: decoded.sub, isActive: true },
      });
      if (!user) return null;

      const payload = { sub: user.id, username: user.username, role: user.role };
      return {
        access_token: this.jwtService.sign(payload),
      };
    } catch {
      return null;
    }
  }

  async getProfile(userId: string) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) return null;
    const { password: _, mfaSecret: __, ...result } = user;
    return result;
  }

  async updateProfile(userId: string, data: Partial<User>) {
    // Prevent updating sensitive fields directly
    const { password: _, role: __, mfaSecret: ___, ...safeData } = data as any;
    await this.usersRepository.update(userId, safeData);
    return this.getProfile(userId);
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user || !(await bcrypt.compare(oldPassword, user.password))) {
      throw new UnauthorizedException('Invalid current password');
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.usersRepository.update(userId, { password: hashedPassword });
    return { success: true };
  }

  async findAllUsers() {
    const users = await this.usersRepository.find({ order: { createdAt: 'ASC' } });
    return users.map(({ password: _, mfaSecret: __, ...user }) => user);
  }
}
