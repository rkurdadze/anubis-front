import {AsyncPipe, DatePipe, DecimalPipe, NgClass, NgFor, NgIf} from '@angular/common';
import {ChangeDetectionStrategy, Component, OnInit} from '@angular/core';
import {FormBuilder, FormGroup, ReactiveFormsModule} from '@angular/forms';
import {RouterLink} from '@angular/router';
import {combineLatest, forkJoin, Observable, of} from 'rxjs';
import {catchError, map, shareReplay, startWith, switchMap} from 'rxjs/operators';

import {VaultApi} from '../../core/api/vault.api';
import {ObjectTypeApi} from '../../core/api/object-type.api';
import {ObjectApi} from '../../core/api/object.api';
import {ValueListApi} from '../../core/api/value-list.api';
import {SearchApi} from '../../core/api/search.api';
import {RepositoryObject} from '../../core/models/object.model';
import {Vault} from '../../core/models/vault.model';
import {ObjectType} from '../../core/models/object-type.model';
import {Page} from '../../core/models/page.model';

interface DashboardMetrics {
  vaults: number;
  objectTypes: number;
  objects: number;
  valueLists: number;
}

interface ObjectDistributionItem {
  typeId: number;
  typeName: string;
  count: number;
  percentage: number;
}

interface ActivityStatistic {
  days: { label: string; count: number }[];
  total: number;
  max: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [NgIf, NgFor, AsyncPipe, DecimalPipe, DatePipe, ReactiveFormsModule, RouterLink, NgClass],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent implements OnInit {
  searchForm!: FormGroup;
  metrics$!: Observable<DashboardMetrics>;
  recentObjects$!: Observable<Page<RepositoryObject>>;
  searchResults$!: Observable<number[]>;
  objectDistribution$!: Observable<ObjectDistributionItem[]>;
  activeVaults$!: Observable<Vault[]>;
  activityStats$!: Observable<ActivityStatistic>;

  constructor(
    private readonly fb: FormBuilder,
    private readonly vaultApi: VaultApi,
    private readonly objectTypeApi: ObjectTypeApi,
    private readonly objectApi: ObjectApi,
    private readonly valueListApi: ValueListApi,
    private readonly searchApi: SearchApi
  ) {
  }

  ngOnInit(): void {
    // === Инициализация формы ===
    this.searchForm = this.fb.group({query: ['']});

    const vaults$ = this.vaultApi
      .list()
      .pipe(catchError(() => of<Vault[]>([])), shareReplay({bufferSize: 1, refCount: true}));

    const activeVaults$ = vaults$.pipe(map(items => items.filter(vault => vault.isActive)));

    const objectTypes$ = this.objectTypeApi
      .list()
      .pipe(catchError(() => of<ObjectType[]>([])), shareReplay({bufferSize: 1, refCount: true}));

    // Загружаем первую страницу один раз
    const objectsPage$ = this.objectApi.list(0, 100).pipe(
      catchError(() =>
        of<Page<RepositoryObject>>({
          content: [],
          page: {
            totalElements: 0,
            totalPages: 0,
            number: 0,
            size: 0
          }
        })
      ),
      shareReplay({ bufferSize: 1, refCount: true })
    );

    // Метрика — считает totalElements
    const objectsCount$ = objectsPage$.pipe(
      map(page => page.page?.totalElements ?? page.content?.length ?? 0),
      catchError(() => of(0))
    );

    // Для отображения таблицы
    const objectsPageForView$ = objectsPage$;

    const valueListsCount$ = this.valueListApi
      .list(0, 1)
      .pipe(
        map(page => {
          const total = page.page?.totalElements ?? 0;
          return total > 0 ? total : page.content?.length ?? 0;
        }),
        catchError(() => of(0)),
        shareReplay({ bufferSize: 1, refCount: true })
      );

    // === Метрики ===
    this.metrics$ = forkJoin({
      vaults: activeVaults$.pipe(map(items => items.length)),
      objectTypes: objectTypes$.pipe(map(items => items.length)),
      objects: objectsCount$,
      valueLists: valueListsCount$
    });

    this.activeVaults$ = activeVaults$;

    // === Последние объекты ===
    this.recentObjects$ = objectsPageForView$.pipe(
      map(page => ({
        content: page.content.slice(0, 6),
        page: {
          totalElements: page.page?.totalElements ?? 0,
          totalPages: page.page?.totalPages ?? 0,
          number: page.page?.number ?? 0,
          size: page.page?.size ?? 0
        }
      } as Page<RepositoryObject>))
    );

    // === Распределение объектов ===
    this.objectDistribution$ = combineLatest([objectsPageForView$, objectTypes$]).pipe(
      map(([page, objectTypes]) => {
        const list = page.content;
        if (!list.length) {
          return [];
        }
        const totalObjects = list.length;
        const counts = list.reduce((acc, current) => {
          const currentCount = acc.get(current.typeId) ?? 0;
          acc.set(current.typeId, currentCount + 1);
          return acc;
        }, new Map<number, number>());

        return Array.from(counts.entries())
          .sort(([aKey, aVal], [bKey, bVal]) => bVal - aVal)
          .slice(0, 5)
          .map(([typeId, count]: [number, number]) => {
            const type = objectTypes.find(item => item.id === typeId);
            return {
              typeId,
              typeName: type?.name ?? `Тип #${typeId}`,
              count,
              percentage: totalObjects ? (count / totalObjects) * 100 : 0
            };
          });
      })
    );

    // === Активность по созданию ===
    this.activityStats$ = objectsPageForView$.pipe(
      map(page => {
        const list = page.content;
        if (!list.length) {
          return {days: [], total: 0, max: 0};
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const formatter = new Intl.DateTimeFormat('ru-RU', {day: '2-digit', month: 'short'});

        const days = Array.from({length: 7}).map((_, index) => {
          const day = new Date(today);
          day.setDate(today.getDate() - (6 - index));
          const startOfDay = new Date(day);
          const endOfDay = new Date(day);
          endOfDay.setHours(23, 59, 59, 999);

          const count = list.filter(item => {
            if (!item.createdAt) {
              return false;
            }

            const createdAt = new Date(item.createdAt);
            return createdAt >= startOfDay && createdAt <= endOfDay;
          }).length;

          return {
            label: formatter.format(day),
            count
          };
        });

        const max = days.reduce((acc, item) => Math.max(acc, item.count), 0);
        const total = days.reduce((acc, item) => acc + item.count, 0);

        return {
          days,
          total,
          max
        };
      })
    );

    // === Результаты поиска ===
    this.searchResults$ = this.searchForm.valueChanges.pipe(
      startWith(this.searchForm.value),
      map(value => value?.query?.trim() ?? ''),
      switchMap(query =>
        !query
          ? of<number[]>([])
          : this.searchApi.search(query).pipe(catchError(() => of<number[]>([])))
      )
    );
  }
}
