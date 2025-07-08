import jwt from 'jsonwebtoken';
import { UserRepository } from '../repositories/user.repository';
import { User, LoginRequest, LoginResponse, CreateUserRequest } from '../models/user.model';

export interface JWTPayload {
  userId: string;
  email: string;
  role: User['role'];
  iat: number;
  exp: number;
}

export interface AuthService {
  login(credentials: LoginRequest): Promise<LoginResponse>;
  register(userData: CreateUserRequest): Promise<LoginResponse>;
  verifyToken(token: string): Promise<JWTPayload>;
  refreshToken(userId: string): Promise<string>;
}

export class AuthServiceImpl implements AuthService {
  //Inject User repository into the class
  //We dont care about the implementation of the user repository, we just need to inject it
  private userRepository: UserRepository;
  private jwtSecret: string;
  private jwtExpiresIn: string;

  constructor(userRepository: UserRepository) {
    this.userRepository = userRepository;
    this.jwtSecret = String(process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production');
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '24h';
  }

  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const user = await this.userRepository.findByEmail(credentials.email);
    
    if (!user) {
      throw new Error('Invalid email or password');
    }

    if (!user.isActive) {
      throw new Error('Account is deactivated');
    }

    const isValidPassword = await this.userRepository.verifyPassword(user, credentials.password);
    
    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    // Update last login
    await this.userRepository.updateLastLogin(user.id);

    // Generate JWT token
    const token = this.generateToken(user);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }

  async register(userData: CreateUserRequest): Promise<LoginResponse> {
    // Check if user already exists
    const existingUser = await this.userRepository.findByEmail(userData.email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Create new user
    const user = await this.userRepository.create(userData);

    // Generate JWT token
    const token = this.generateToken(user);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }

  async verifyToken(token: string): Promise<JWTPayload> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as JWTPayload;
      
      // Verify user still exists and is active
      const user = await this.userRepository.findById(decoded.userId);
      if (!user || !user.isActive) {
        throw new Error('User not found or inactive');
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid token');
      }
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token expired');
      }
      throw error;
    }
  }

  async refreshToken(userId: string): Promise<string> {
    const user = await this.userRepository.findById(userId);
    if (!user || !user.isActive) {
      throw new Error('User not found or inactive');
    }

    return this.generateToken(user);
  }

  private generateToken(user: User): string {
    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    return jwt.sign(payload as object, this.jwtSecret as string, {
      expiresIn: this.jwtExpiresIn,
    } as jwt.SignOptions);
  }
} 