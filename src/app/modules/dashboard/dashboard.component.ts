import { AsyncPipe, DatePipe, DecimalPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map, startWith, switchMap } from 'rxjs/operators';

import { VaultApi } from '../../core/api/vault.api';
import { ObjectTypeApi } from '../../core/api/object-type.api';
import { ObjectApi } from '../../core/api/object.api';
import { ValueListApi } from '../../core/api/value-list.api';
import { SearchApi } from '../../core/api/search.api';
import { RepositoryObject } from '../../core/models/object.model';

interface DashboardMetrics {
  vaults: number;
  objectTypes: number;
  objects: number;
  valueLists: number;
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
  recentObjects$!: Observable<RepositoryObject[]>;
  searchResults$!: Observable<number[]>;

  constructor(
    private readonly fb: FormBuilder,
    private readonly vaultApi: VaultApi,
    private readonly objectTypeApi: ObjectTypeApi,
    private readonly objectApi: ObjectApi,
    private readonly valueListApi: ValueListApi,
    private readonly searchApi: SearchApi
  ) {}

  ngOnInit(): void {
    // === Инициализация формы ===
    this.searchForm = this.fb.group({ query: [''] });

    // === Метрики ===
    this.metrics$ = forkJoin({
      vaults: this.vaultApi.getActive().pipe(map(items => items.length), catchError(() => of(0))),
      objectTypes: this.objectTypeApi.list().pipe(map(items => items.length), catchError(() => of(0))),
      objects: this.objectApi.list().pipe(map(items => items.length), catchError(() => of(0))),
      valueLists: this.valueListApi
        .list(0, 1)
        .pipe(map(page => page.totalElements ?? page.content.length), catchError(() => of(0)))
    });

    // === Последние объекты ===
    this.recentObjects$ = this.objectApi.list().pipe(
      map(list => list.slice(0, 6)),
      catchError(() => of([]))
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
