import {ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, OnInit} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {AsyncPipe, NgClass, NgFor, NgIf, NgSwitch, NgSwitchCase} from '@angular/common';
import {SocketService, WsState} from '../../core/socket.service';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {FileSocketService} from '../../core/services/FileSocketService';
import {ToastService} from '../../shared/services/toast.service';
import {Observable} from 'rxjs';

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'app-navigation',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, NgFor, NgClass, NgSwitch, NgSwitchCase, AsyncPipe, NgIf],
  templateUrl: './navigation.component.html',
  styleUrls: ['./navigation.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NavigationComponent implements OnInit{
  readonly items: NavItem[] = [
    { label: 'Панель управления', icon: 'fa-solid fa-gauge-high', route: '/dashboard' },
    { label: 'Файловые хранилища', icon: 'fa-solid fa-server', route: '/file-storages' },
    { label: 'Хранилища', icon: 'fa-solid fa-database', route: '/vaults' },
    { label: 'Типы объектов', icon: 'fa-solid fa-diagram-project', route: '/object-types' },
    { label: 'Справочники', icon: 'fa-solid fa-list-check', route: '/value-lists' },
    { label: 'Свойства', icon: 'fa-solid fa-table-cells-large', route: '/properties' },
    { label: 'Классы', icon: 'fa-solid fa-layer-group', route: '/classes' },
    { label: 'Объекты', icon: 'fa-solid fa-box-archive', route: '/objects' },
    { label: 'Роли', icon: 'fa-solid fa-user-shield', route: '/roles' },
    { label: 'Группы', icon: 'fa-solid fa-people-group', route: '/groups' },
    { label: 'Пользователи', icon: 'fa-solid fa-users-gear', route: '/users' },
    { label: 'ACL', icon: 'fa-solid fa-lock', route: '/acls' },
    { label: 'Представления', icon: 'fa-solid fa-folder-tree', route: '/views' },
    { label: 'Поиск', icon: 'fa-solid fa-magnifying-glass', route: '/search' }
  ];

  private readonly toast = inject(ToastService);
  state: WsState = 'disconnected'; // 🔹 дефолт

  constructor(
    private readonly socketService: SocketService,
    private readonly destroyRef: DestroyRef,
    private readonly fileSocket: FileSocketService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // WebSocket состояние
    this.socketService.connection$()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(state => {
        this.state = state;
        this.cdr.markForCheck(); // 🔥 заставляем Angular обновить шаблон
      });

    // Подписка на файлы
    this.fileSocket
      .watchAllFiles()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(msg => {
        this.toast.info(`Файл #${msg.fileId} → ${msg.status}`);
      });
  }

}
