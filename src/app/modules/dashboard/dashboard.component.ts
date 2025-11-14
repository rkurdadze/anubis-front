import { AsyncPipe, DatePipe, DecimalPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { combineLatest, forkJoin, Observable, of } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap } from 'rxjs/operators';

import { VaultApi } from '../../core/api/vault.api';
import { ObjectTypeApi } from '../../core/api/object-type.api';
import { ObjectApi } from '../../core/api/object.api';
import { ValueListApi } from '../../core/api/value-list.api';
import { SearchApi } from '../../core/api/search.api';
import { ClassApi } from '../../core/api/class.api';

import { RepositoryObject } from '../../core/models/object.model';
import { Vault } from '../../core/models/vault.model';
import { ObjectType } from '../../core/models/object-type.model';
import { ObjectClass } from '../../core/models/class.model';
import { Page } from '../../core/models/page.model';
import {DashboardApi} from '../../core/api/dashboard.api';

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
  imports: [
    NgIf,
    NgFor,
    AsyncPipe,
    DecimalPipe,
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    NgClass
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent implements OnInit {
  searchForm!: FormGroup;

  metrics$!: Observable<DashboardMetrics>;
  recentObjects$!: Observable<Page<RepositoryObject & { className?: string }>>;
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
    private readonly classApi: ClassApi,
    private readonly searchApi: SearchApi,
    private readonly dashboardApi: DashboardApi,
  ) {}

  ngOnInit(): void {
    this.searchForm = this.fb.group({ query: [''] });
    this.initDashboardData();
  }

  /** Инициализация всех потоков данных дашборда */
  private initDashboardData(): void {
    const vaults$ = this.loadVaults();
    const objectTypes$ = this.loadObjectTypes();
    const objectsPage$ = this.loadObjectsPage();
    const classes$ = this.loadClasses();

    this.activeVaults$ = vaults$.pipe(map(v => v.filter(x => x.isActive)));

    this.metrics$ = this.buildMetrics$(vaults$, objectTypes$, objectsPage$);
    this.recentObjects$ = this.buildRecentObjects$(objectsPage$, classes$, objectTypes$);
    this.objectDistribution$ = this.dashboardApi
      .distribution()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));

    this.activityStats$ = this.dashboardApi
      .activity(7)
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
    this.searchResults$ = this.buildSearchResults$();
  }

  // === ЗАГРУЗКА ДАННЫХ ===

  private loadVaults(): Observable<Vault[]> {
    return this.vaultApi
      .list()
      .pipe(catchError(() => of([])), shareReplay({ bufferSize: 1, refCount: true }));
  }

  private loadObjectTypes(): Observable<ObjectType[]> {
    return this.objectTypeApi
      .list()
      .pipe(catchError(() => of([])), shareReplay({ bufferSize: 1, refCount: true }));
  }

  private loadClasses(): Observable<ObjectClass[]> {
    return this.classApi
      .list(0, 1000) // или без параметров, если API поддерживает получение всех
      .pipe(
        map(page => page.content ?? []),
        catchError(() => of([])),
        shareReplay({ bufferSize: 1, refCount: true })
      );
  }


  private loadObjectsPage(): Observable<Page<RepositoryObject>> {
    return this.objectApi
      .list(0, 10)
      .pipe(
        catchError(() =>
          of<Page<RepositoryObject>>({
            content: [],
            page: { totalElements: 0, totalPages: 0, number: 0, size: 0 }
          })
        ),
        shareReplay({ bufferSize: 1, refCount: true })
      );
  }

  // === ПОСТРОЕНИЕ ПОТОКОВ ===

  private buildMetrics$(
    vaults$: Observable<Vault[]>,
    objectTypes$: Observable<ObjectType[]>,
    objectsPage$: Observable<Page<RepositoryObject>>
  ): Observable<DashboardMetrics> {
    const activeVaultsCount$ = vaults$.pipe(map(v => v.filter(x => x.isActive).length));
    const objectTypesCount$ = objectTypes$.pipe(map(v => v.length));
    const objectsCount$ = objectsPage$.pipe(
      map(page => page.page?.totalElements ?? page.content.length ?? 0)
    );
    const valueListsCount$ = this.valueListApi
      .list(0, 1)
      .pipe(
        map(p => p.page?.totalElements ?? p.content.length ?? 0),
        catchError(() => of(0))
      );

    return forkJoin({
      vaults: activeVaultsCount$,
      objectTypes: objectTypesCount$,
      objects: objectsCount$,
      valueLists: valueListsCount$
    });
  }

  private buildRecentObjects$(
    objectsPage$: Observable<Page<RepositoryObject>>,
    classes$: Observable<ObjectClass[]>,
    objectTypes$: Observable<ObjectType[]>
  ): Observable<Page<RepositoryObject & { className?: string; typeName?: string }>> {
    return combineLatest([objectsPage$, classes$, objectTypes$]).pipe(
      map(([page, classes, types]) => {
        const content = page.content.slice(0, 6).map(obj => {
          const cls = classes.find(c => c.id === obj.classId);
          const type = types.find(t => t.id === obj.typeId);
          return {
            ...obj,
            className: cls?.name ?? `Класс #${obj.classId ?? '—'}`,
            typeName: type?.name ?? `Тип #${obj.typeId ?? '—'}`
          };
        });
        return { ...page, content };
      })
    );
  }


  private buildSearchResults$(): Observable<number[]> {
    return this.searchForm.valueChanges.pipe(
      startWith(this.searchForm.value),
      map(v => v?.query?.trim() ?? ''),
      switchMap(q =>
        !q ? of([]) : this.searchApi.search(q).pipe(catchError(() => of<number[]>([])))
      )
    );
  }
}
