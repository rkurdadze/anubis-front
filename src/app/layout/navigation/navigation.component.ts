import {ChangeDetectionStrategy, Component, DestroyRef, OnInit} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgClass, NgFor } from '@angular/common';
import {SocketService} from '../../core/socket.service';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'app-navigation',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, NgFor, NgClass],
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

  isConnected = false;

  constructor(
    private readonly socketService: SocketService,
    private readonly destroyRef: DestroyRef
  ) {}

  ngOnInit(): void {
    this.socketService.connection$()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(connected => {
        this.isConnected = connected;
        console.log(connected ? '🟢 WS подключён' : '🔴 WS отключён');
      });
  }



}
