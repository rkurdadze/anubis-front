import { AsyncPipe, DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {BehaviorSubject, Subject, combineLatest, of, Observable} from 'rxjs';
import {catchError, map, shareReplay, startWith, switchMap, takeUntil, tap} from 'rxjs/operators';

import { ObjectApi } from '../../../../core/api/object.api';
import { ObjectTypeApi } from '../../../../core/api/object-type.api';
import { ClassApi } from '../../../../core/api/class.api';
import { RepositoryObject, RepositoryObjectRequest } from '../../../../core/models/object.model';
import { ObjectClass } from '../../../../core/models/class.model';
import { ObjectType } from '../../../../core/models/object-type.model';
import { ToastService, ToastType } from '../../../../shared/services/toast.service';
import {Page} from '../../../../core/models/page.model';

interface ObjectsListItem extends RepositoryObject {
  typeName?: string;
  className?: string;
}

@Component({
  selector: 'app-objects-list',
  standalone: true,
  imports: [AsyncPipe, DatePipe, NgIf, NgFor, NgClass, ReactiveFormsModule, RouterLink],
  templateUrl: './objects-list.component.html',
  styleUrls: ['./objects-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ObjectsListComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly objectApi = inject(ObjectApi);
  private readonly objectTypeApi = inject(ObjectTypeApi);
  private readonly classApi = inject(ClassApi);
  private readonly toast = inject(ToastService);
  private readonly destroy$ = new Subject<void>();
  private readonly reload$ = new BehaviorSubject<number>(0);

  readonly filterForm = this.fb.group({
    search: [''],
    typeId: [null as number | null],
    classId: [null as number | null],
    showDeleted: [false]
  });

  readonly createForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    typeId: [null as number | null, Validators.required],
    classId: [null as number | null]
  });

  readonly objectTypes$ = this.objectTypeApi.list().pipe(
    catchError(() => {
      this.showMessage('error', 'Не удалось загрузить типы объектов.');
      return of<ObjectType[]>([]);
    }),
    shareReplay(1)
  );


  readonly classes$ = this.classApi.list(0, 500).pipe(
    map(response => response.content ?? []),
    catchError(() => {
      this.showMessage('error', 'Не удалось загрузить список классов.');
      return of<ObjectClass[]>([]);
    }),
    shareReplay(1)
  );

  readonly availableClasses$ = combineLatest([
    this.classes$,
    this.filterForm.get('typeId')!.valueChanges.pipe(startWith(this.filterForm.get('typeId')!.value))
  ]).pipe(
    map(([classes, typeId]) => (typeId ? classes.filter(cls => cls.objectTypeId === typeId) : classes))
  );

  readonly createFormClasses$ = combineLatest([
    this.classes$,
    this.createForm.get('typeId')!.valueChanges.pipe(startWith(this.createForm.get('typeId')!.value))
  ]).pipe(
    map(([classes, typeId]) => (typeId ? classes.filter(cls => cls.objectTypeId === typeId) : classes))
  );

  readonly objectsPage$ = combineLatest([
    this.reload$,
    this.filterForm.valueChanges.pipe(startWith(this.filterForm.value))
  ]).pipe(
    switchMap(([_, filters]) => {
      console.log('🔍 Filters applied:', filters);
      console.log('📡 API Request:', this.objectApi['baseUrl'], { page: this.currentPage, size: this.pageSize, filters });
      return this.objectApi.list(this.currentPage, this.pageSize, filters);
    }),
    tap(response => {
      this.totalPages = response.page?.totalPages ?? 1;
      this.isPerformingAction = false;
    }),
    shareReplay(1)
  );

  readonly objectsPageWithNames$: Observable<Page<ObjectsListItem>> = combineLatest([
    this.objectsPage$,
    this.objectTypes$,
    this.classes$
  ]).pipe(
    map(([page, types, classes]) => {
      const content = page.content.map(obj => {
        const type = types.find(t => t.id === obj.typeId);
        const cls = classes.find(c => c.id === obj.classId);
        return {
          ...obj,
          typeName: type?.name ?? `Тип #${obj.typeId ?? '—'}`,
          className: cls?.name ?? `Класс #${obj.classId ?? '—'}`
        };
      });
      return { ...page, content };
    }),
    shareReplay(1)
  );

  isCreatePanelOpen = false;
  // 🔹 Текущая страница и размер
  currentPage = 0;
  pageSize = 20;
  // 🔹 Общее число страниц
  totalPages = 1;

  // 🔹 Контроль загрузки
  isPerformingAction = false;


  loadPage(page: number): void {
    if (page < 0 || (this.totalPages && page >= this.totalPages)) {
      return; // за пределы не выходим
    }
    this.currentPage = page;
    this.isPerformingAction = true;
    this.reload$.next(page); // ⚙️ передаём значение для обновления стрима
  }

  nextPage(): void {
    this.loadPage(this.currentPage + 1);
  }

  previousPage(): void {
    this.loadPage(this.currentPage - 1);
  }

  ngOnInit(): void {
    this.filterForm
      .get('typeId')!
      .valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.filterForm.get('classId')!.setValue(null, { emitEvent: false });
      });

    this.createForm
      .get('typeId')!
      .valueChanges.pipe(
        startWith(this.createForm.get('typeId')!.value),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.createForm.get('classId')!.setValue(null);
      });

    // 🔹 Загружаем первую страницу объектов при открытии
    this.loadPage(0);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleCreatePanel(): void {
    this.isCreatePanelOpen = !this.isCreatePanelOpen;
    if (!this.isCreatePanelOpen) {
      this.createForm.reset({ name: '', typeId: null, classId: null });
    }
  }

  refresh(): void {
    this.reload$.next(this.currentPage);
  }

  createObject(): void {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }

    const payload = this.createForm.getRawValue();
    const request: RepositoryObjectRequest = {
      name: payload.name!.trim(),
      typeId: payload.typeId!,
      classId: payload.classId ?? null
    };

    this.isPerformingAction = true;
    this.objectApi
      .create(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: created => {
          this.showMessage('success', `Объект «${created.name}» создан.`);
          this.toggleCreatePanel();
          this.refresh();
          this.isPerformingAction = false;
        },
        error: () => {
          this.showMessage('error', 'Не удалось создать объект. Попробуйте ещё раз.');
          this.isPerformingAction = false;
        }
      });
  }

  cloneObject(object: RepositoryObject): void {
    const request: RepositoryObjectRequest = {
      name: `${object.name} (копия)`.replace(/\s+\(копия\)$/u, '') + ' (копия)',
      typeId: object.typeId,
      classId: object.classId ?? null
    };

    this.isPerformingAction = true;
    this.objectApi
      .create(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: clone => {
          this.showMessage('success', `Создан клон «${clone.name}».`);
          this.refresh();
          this.isPerformingAction = false;
        },
        error: () => {
          this.showMessage('error', 'Не удалось клонировать объект.');
          this.isPerformingAction = false;
        }
      });
  }

  softDelete(object: RepositoryObject): void {
    if (object.isDeleted) {
      return;
    }

    if (!window.confirm(`Отправить объект «${object.name}» в корзину?`)) {
      return;
    }

    this.isPerformingAction = true;
    this.objectApi
      .softDelete(object.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showMessage('success', `Объект «${object.name}» перемещён в корзину.`);
          this.refresh();
          this.isPerformingAction = false;
        },
        error: () => {
          this.showMessage('error', 'Не удалось удалить объект.');
          this.isPerformingAction = false;
        }
      });
  }

  hardDelete(object: RepositoryObject): void {
    if (!window.confirm(`Жестко удалить объект «${object.name}»? Действие необратимо.`)) {
      return;
    }

    this.isPerformingAction = true;
    this.objectApi
      .hardDelete(object.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showMessage('success', `Объект «${object.name}» удалён без возможности восстановления.`);
          this.refresh();
          this.isPerformingAction = false;
        },
        error: () => {
          this.showMessage('error', 'Не удалось выполнить жесткое удаление.');
          this.isPerformingAction = false;
        }
      });
  }

  trackByObjectId(index: number, item: ObjectsListItem): number {
    return item.id;
  }

  private showMessage(type: ToastType, text: string): void {
    this.toast.show(type, text);
  }
}
