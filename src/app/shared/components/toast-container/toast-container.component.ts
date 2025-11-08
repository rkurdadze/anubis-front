import { AsyncPipe, NgClass, NgFor } from '@angular/common';
import { ChangeDetectionStrategy, Component, ViewEncapsulation, inject } from '@angular/core';

import { ToastMessage, ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [AsyncPipe, NgClass, NgFor],
  templateUrl: './toast-container.component.html',
  styleUrls: ['./toast-container.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class ToastContainerComponent {
  private readonly toastService = inject(ToastService);
  readonly toasts$ = this.toastService.toasts$;

  dismiss(id: number): void {
    this.toastService.dismiss(id);
  }

  toastClass(toast: ToastMessage): string {
    switch (toast.type) {
      case 'success':
        return 'toast--success';
      case 'error':
        return 'toast--error';
      case 'warning':
        return 'toast--warning';
      default:
        return 'toast--info';
    }
  }
}
