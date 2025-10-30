import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgClass, NgFor } from '@angular/common';

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
export class NavigationComponent {
  readonly items: NavItem[] = [
    { label: 'Панель управления', icon: 'fa-solid fa-gauge-high', route: '/dashboard' },
    { label: 'Объекты', icon: 'fa-solid fa-box-archive', route: '/objects' },
    { label: 'Типы объектов', icon: 'fa-solid fa-diagram-project', route: '/object-types' },
    { label: 'Классы', icon: 'fa-solid fa-layer-group', route: '/classes' },
    { label: 'Свойства', icon: 'fa-solid fa-table-cells-large', route: '/properties' },
    { label: 'Справочники', icon: 'fa-solid fa-list-check', route: '/value-lists' },
    { label: 'Представления', icon: 'fa-solid fa-folder-tree', route: '/views' },
    { label: 'Пользователи', icon: 'fa-solid fa-users-gear', route: '/users' },
    { label: 'Поиск', icon: 'fa-solid fa-magnifying-glass', route: '/search' }
  ];
}
