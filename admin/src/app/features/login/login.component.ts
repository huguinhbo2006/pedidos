import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-page">
      <div class="login-card card">
        <div class="brand-hero">
          <img src="logo-mary.jpg" alt="Taquería Mary" class="logo-img" />
          <h1>Taquería Mary</h1>
          <p>Auténtica Comida Mexicana · Pedidos y Entregas</p>
        </div>

        <form (ngSubmit)="submit()" class="login-form">
          @if (errorMessage()) {
            <div class="alert alert-error">{{ errorMessage() }}</div>
          }

          <div class="form-field">
            <label for="username">Usuario</label>
            <input
              id="username"
              type="text"
              [(ngModel)]="username"
              name="username"
              placeholder="hugo.perez"
              autocomplete="username"
              required
              autofocus
            />
          </div>

          <div class="form-field">
            <label for="password">Contraseña</label>
            <div class="password-wrap">
              <input
                id="password"
                [type]="showPassword() ? 'text' : 'password'"
                [(ngModel)]="password"
                name="password"
                placeholder="•••••"
                autocomplete="current-password"
                required
              />
              <button
                type="button"
                class="toggle-pw"
                (click)="showPassword.set(!showPassword())"
                [attr.aria-label]="showPassword() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
              >
                {{ showPassword() ? 'Ocultar' : 'Ver' }}
              </button>
            </div>
          </div>

          <button type="submit" class="btn btn-primary btn-lg submit-btn" [disabled]="loading()">
            {{ loading() ? 'Ingresando...' : 'Iniciar sesión' }}
          </button>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .login-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      background:
        radial-gradient(circle at top left, rgba(200, 75, 36, 0.14), transparent 45%),
        radial-gradient(circle at bottom right, rgba(217, 130, 24, 0.14), transparent 45%),
        var(--bg-canvas);
    }
    .login-card {
      width: 100%;
      max-width: 410px;
      padding: 2.1rem 1.85rem;
      box-shadow: var(--shadow-lg);
    }
    .brand-hero {
      text-align: center;
      margin-bottom: 1.65rem;

      .logo-img {
        width: 96px;
        height: 96px;
        object-fit: cover;
        margin: 0 auto 0.85rem;
        border-radius: 20px;
        border: 2px solid var(--border-light);
        box-shadow: 0 8px 20px rgba(200, 75, 36, 0.22);
        display: block;
      }

      h1 {
        margin: 0;
        font-size: 1.55rem;
        font-weight: 800;
        letter-spacing: -0.02em;
      }

      p {
        margin: 0.25rem 0 0;
        font-size: 0.9rem;
        color: var(--text-secondary);
      }
    }
    .login-form {
      display: flex;
      flex-direction: column;
      gap: 1.05rem;
    }
    .password-wrap {
      position: relative;
      display: flex;
      align-items: center;

      input {
        padding-right: 4.5rem;
      }

      .toggle-pw {
        position: absolute;
        right: 0.5rem;
        background: var(--bg-subtle);
        border: none;
        border-radius: 6px;
        padding: 0.28rem 0.55rem;
        font-size: 0.76rem;
        font-weight: 600;
        color: var(--text-secondary);
        cursor: pointer;
      }
    }
    .submit-btn {
      width: 100%;
      margin-top: 0.35rem;
    }
  `],
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  username = '';
  password = '';
  readonly loading = signal(false);
  readonly showPassword = signal(false);
  readonly errorMessage = signal<string | null>(null);

  submit(): void {
    if (!this.username.trim() || !this.password) {
      this.errorMessage.set('Ingresa usuario y contraseña.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    this.auth.login(this.username, this.password).subscribe({
      next: () => {
        this.loading.set(false);
        this.toast.success('Bienvenido, Hugo.');
        void this.router.navigate(['/pedidos']);
      },
      error: (err) => {
        this.loading.set(false);
        const msg =
          err?.error?.errors?.username?.[0] ||
          err?.error?.message ||
          'No se pudo iniciar sesión. Verifica tus credenciales.';
        this.errorMessage.set(msg);
      },
    });
  }
}
