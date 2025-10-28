import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AsyncPipe, NgIf } from '@angular/common';

import { LoadingOverlayComponent } from './shared/components/loading-overlay/loading-overlay.component';
import { LoadingIndicatorService } from './core/services/loading-indicator.service';
import { NavigationComponent } from './layout/navigation/navigation.component';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  imports: [RouterOutlet, LoadingOverlayComponent, AsyncPipe, NgIf, NavigationComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent {
  constructor(public readonly loader: LoadingIndicatorService) {}
}
