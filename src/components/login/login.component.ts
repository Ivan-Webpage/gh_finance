import { Component, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-container">
      <div class="login-box">
        <div class="login-header">
          <h1>Galaxy House Finance</h1>
          <p class="subtitle">管理系統登入</p>
        </div>

        @if(error()) {
          <div class="error-message">
            {{ error() }}
          </div>
        }

        <div class="login-method">
          <div id="google-signin-button" class="google-button-container"></div>
        </div>

        <div class="footer-info">
          <p>此系統需要使用 Google 帳號登入</p>
          <p>如有問題，請聯絡管理員</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .login-container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #8C4F28 0%, #000000 100%);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 20px;
    }

    .login-box {
      background: #efd07f;
      padding: 40px;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
      width: 100%;
      max-width: 400px;
    }

    .login-header {
      text-align: center;
      margin-bottom: 30px;
    }

    h1 {
      color: #333;
      margin: 0 0 8px 0;
      font-size: 28px;
      font-weight: 700;
    }

    .subtitle {
      color: #666;
      margin: 0;
      font-size: 14px;
    }

    .login-method {
      margin-bottom: 20px;
    }

    .google-button-container {
      margin-bottom: 15px;
    }

    .google-login-btn {
      width: 100%;
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 6px;
      background: white;
      color: #333;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      transition: all 0.3s ease;
    }

    .google-login-btn:hover:not(:disabled) {
      background: #f8f8f8;
      border-color: #ccc;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .error-message {
      background-color: #fee;
      color: #c00;
      padding: 12px;
      border-radius: 6px;
      font-size: 13px;
      margin-bottom: 20px;
      border: 1px solid #fcc;
    }

    .footer-info {
      text-align: center;
      margin-top: 30px;
      color: #999;
      font-size: 12px;
      line-height: 1.6;
    }

    .footer-info p {
      margin: 5px 0;
    }
  `],
})
export class LoginComponent implements OnInit {
  error = signal<string | null>(null);

  constructor(private authService: AuthService, private router: Router) {}

  ngOnInit() {
    // Check if already logged in
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/dashboard']);
    }

    // Load Google Sign-In script
    this.loadGoogleSignInScript();
  }

  private loadGoogleSignInScript() {
    // Check if script already loaded
    if ((window as any).google) {
      this.initializeGoogleSignIn();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => this.initializeGoogleSignIn();
    document.head.appendChild(script);
  }

  private initializeGoogleSignIn() {
    const googleClientId = environment.googleClientId;
    
    if (!googleClientId || googleClientId.includes('YOUR_')) {
      console.warn('Google Client ID not configured. Please set VITE_GOOGLE_CLIENT_ID environment variable.');
      this.error.set('系統未正確配置 Google OAuth。請聯絡管理員。');
      return;
    }

    try {
      (window as any).google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response: any) => this.handleGoogleLogin(response),
      });

      // Render the Google Sign-In button
      const buttonElement = document.getElementById('google-signin-button');
      if (buttonElement) {
        const containerWidth = Math.max(240, Math.min(400, Math.floor(buttonElement.getBoundingClientRect().width || 320)));
        (window as any).google.accounts.id.renderButton(buttonElement, {
          theme: 'outline',
          size: 'large',
          width: containerWidth,
        });
      }
    } catch (err) {
      console.error('Failed to initialize Google Sign-In:', err);
      this.error.set('無法初始化 Google 登入');
    }
  }

  private async handleGoogleLogin(response: any) {
    try {
      if (response.credential) {
        const success = await this.authService.loginWithGoogle(response.credential);
        if (success) {
          this.router.navigate(['/dashboard']);
        } else {
          this.error.set(this.authService.error() || 'Google 登入失敗');
        }
      }
    } catch (err) {
      console.error('Login error:', err);
      this.error.set('登入失敗，請稍後重試');
    }
  }
}
