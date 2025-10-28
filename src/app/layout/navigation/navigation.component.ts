import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {NgClass, NgFor} from '@angular/common';

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
    { label: 'Панель управления', icon: 'bi-grid', route: '/' },
    { label: 'Объекты', icon: 'bi-collection', route: '/objects' },
    { label: 'Типы объектов', icon: 'bi-diagram-3', route: '/object-types' },
    { label: 'Классы', icon: 'bi-layers', route: '/classes' },
    { label: 'Свойства', icon: 'bi-ui-checks-grid', route: '/properties' },
    { label: 'Справочники', icon: 'bi-card-checklist', route: '/value-lists' },
    { label: 'Представления', icon: 'bi-folder2-open', route: '/views' },
    { label: 'Поиск', icon: 'bi-search', route: '/search' }
  ];
}
