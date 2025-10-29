import { AsyncPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { BehaviorSubject, Subject, combineLatest, of } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap, takeUntil } from 'rxjs/operators';

import { ValueListApi } from '../../../../core/api/value-list.api';
import { ValueList, ValueListItem } from '../../../../core/models/value-list.model';

interface UiMessage {
  type: 'success' | 'error';
  text: string;
}

@Component({
  selector: 'app-value-lists-overview',
  standalone: true,
  imports: [AsyncPipe, NgIf, NgFor, NgClass, ReactiveFormsModule],
  templateUrl: './value-lists-overview.component.html',
  styleUrls: ['./value-lists-overview.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ValueListsOverviewComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly valueListApi = inject(ValueListApi);
  private readonly destroy$ = new Subject<void>();
  private readonly reload$ = new BehaviorSubject<void>(undefined);
  private readonly itemsReload$ = new BehaviorSubject<void>(undefined);
  private readonly selectedListId$ = new BehaviorSubject<number | null>(null);
  private readonly messageSubject = new BehaviorSubject<UiMessage | null>(null);
  private messageTimeoutHandle: number | null = null;
  private currentListId: number | null = null;

  readonly filterForm = this.fb.group({
    search: [''],
    showInactive: [false]
  });

  readonly listForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    isActive: [true],
    nameI18n: ['']
  });

  readonly itemForm = this.fb.group({
    value: ['', [Validators.required, Validators.maxLength(255)]],
    valueI18n: [''],
    sortOrder: [0],
    parentItemId: [null as number | null],
    externalCode: [''],
    isActive: [true]
  });

  readonly message$ = this.messageSubject.asObservable();

  readonly valueLists$ = this.reload$.pipe(
    switchMap(() =>
      this.valueListApi.list(0, 500).pipe(
        map(response => response.content ?? []),
        catchError(() => {
          this.setMessage({ type: 'error', text: 'Не удалось загрузить справочники.' });
          return of<ValueList[]>([]);
        })
      )
    ),
    shareReplay(1)
  );

  readonly filteredValueLists$ = combineLatest([
    this.valueLists$,
    this.filterForm.valueChanges.pipe(startWith(this.filterForm.value))
  ]).pipe(
    map(([lists, filters]) => {
      const searchTerm = filters?.search?.trim().toLowerCase() ?? '';
      const showInactive = !!filters?.showInactive;

      return lists
        .filter(list => {
          const matchesSearch = !searchTerm || list.name.toLowerCase().includes(searchTerm) || `${list.id}`.includes(searchTerm);
          const matchesActive = showInactive || list.isActive;
          return matchesSearch && matchesActive;
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    })
  );

  readonly selectedList$ = combineLatest([this.valueLists$, this.selectedListId$]).pipe(
    map(([lists, selectedId]) => lists.find(list => list.id === selectedId) ?? null)
  );

  readonly items$ = combineLatest([this.selectedListId$, this.itemsReload$]).pipe(
    switchMap(([listId]) => {
      if (!listId) {
        return of<ValueListItem[]>([]);
      }

      return this.valueListApi.listItems(listId).pipe(
        catchError(() => {
          this.setMessage({ type: 'error', text: 'Не удалось загрузить элементы справочника.' });
          return of<ValueListItem[]>([]);
        })
      );
    }),
    shareReplay(1)
  );

  isSavingList = false;
  isSavingItem = false;
  deletingListId: number | null = null;
  deletingItemId: number | null = null;

  ngOnInit(): void {
    this.selectedList$
      .pipe(takeUntil(this.destroy$))
      .subscribe(selected => {
        this.currentListId = selected?.id ?? null;
        if (selected) {
          this.listForm.reset({
            name: selected.name,
            isActive: selected.isActive,
            nameI18n: selected.nameI18n ? JSON.stringify(selected.nameI18n, null, 2) : ''
          });
          this.itemsReload$.next();
        } else {
          this.listForm.reset({ name: '', isActive: true, nameI18n: '' });
          this.itemsReload$.next();
        }
        this.itemForm.reset({ value: '', valueI18n: '', sortOrder: 0, parentItemId: null, externalCode: '', isActive: true });
      });
  }

  ngOnDestroy(): void {
    if (this.messageTimeoutHandle !== null) {
      window.clearTimeout(this.messageTimeoutHandle);
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  selectList(list: ValueList): void {
    this.selectedListId$.next(list.id);
  }

  startCreate(): void {
    this.selectedListId$.next(null);
    this.listForm.reset({ name: '', isActive: true, nameI18n: '' });
    this.itemForm.reset({ value: '', valueI18n: '', sortOrder: 0, parentItemId: null, externalCode: '', isActive: true });
  }

  saveList(): void {
    if (this.listForm.invalid) {
      this.listForm.markAllAsTouched();
      return;
    }

    const value = this.listForm.getRawValue();
    const nameI18n = this.parseJson(value.nameI18n ?? '');
    if (nameI18n === null) {
      return;
    }

    const payload: ValueList = {
      id: this.currentListId ?? 0,
      name: value.name!.trim(),
      isActive: value.isActive ?? true,
      nameI18n: nameI18n
    };

    this.isSavingList = true;

    if (this.currentListId) {
      this.valueListApi
        .update(this.currentListId, payload)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: updated => {
            this.setMessage({ type: 'success', text: `Справочник «${updated.name}» обновлён.` });
            this.refresh();
            this.isSavingList = false;
          },
          error: () => {
            this.setMessage({ type: 'error', text: 'Не удалось сохранить справочник.' });
            this.isSavingList = false;
          }
        });
      return;
    }

    this.valueListApi
      .create(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: created => {
          this.setMessage({ type: 'success', text: `Справочник «${created.name}» создан.` });
          this.refresh();
          this.selectedListId$.next(created.id);
          this.isSavingList = false;
        },
        error: () => {
          this.setMessage({ type: 'error', text: 'Не удалось создать справочник.' });
          this.isSavingList = false;
        }
      });
  }

  deleteList(list: ValueList): void {
    if (this.deletingListId !== null) {
      return;
    }

    if (!window.confirm(`Удалить справочник «${list.name}»?`)) {
      return;
    }

    this.deletingListId = list.id;
    this.valueListApi
      .delete(list.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.setMessage({ type: 'success', text: `Справочник «${list.name}» удалён.` });
          this.refresh();
          if (this.currentListId === list.id) {
            this.startCreate();
          }
          this.deletingListId = null;
        },
        error: () => {
          this.setMessage({ type: 'error', text: 'Не удалось удалить справочник.' });
          this.deletingListId = null;
        }
      });
  }

  createItem(): void {
    if (!this.currentListId) {
      this.setMessage({ type: 'error', text: 'Выберите справочник для добавления значений.' });
      return;
    }

    if (this.itemForm.invalid) {
      this.itemForm.markAllAsTouched();
      return;
    }

    const value = this.itemForm.getRawValue();
    const valueI18n = this.parseJson(value.valueI18n ?? '');
    if (valueI18n === null) {
      return;
    }

    const payload: ValueListItem = {
      id: 0,
      valueListId: this.currentListId,
      value: value.value!.trim(),
      valueI18n: valueI18n,
      sortOrder: value.sortOrder ?? undefined,
      parentItemId: value.parentItemId ?? null,
      externalCode: value.externalCode?.trim() || undefined,
      isActive: value.isActive ?? true
    };

    this.isSavingItem = true;
    this.valueListApi
      .createItem(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.setMessage({ type: 'success', text: 'Элемент справочника добавлен.' });
          this.itemForm.reset({ value: '', valueI18n: '', sortOrder: 0, parentItemId: null, externalCode: '', isActive: true });
          this.itemsReload$.next();
          this.isSavingItem = false;
        },
        error: () => {
          this.setMessage({ type: 'error', text: 'Не удалось добавить элемент.' });
          this.isSavingItem = false;
        }
      });
  }

  deleteItem(item: ValueListItem): void {
    if (this.deletingItemId !== null) {
      return;
    }

    if (!window.confirm('Удалить элемент справочника?')) {
      return;
    }

    this.deletingItemId = item.id;
    this.valueListApi
      .deleteItem(item.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.setMessage({ type: 'success', text: 'Элемент удалён.' });
          this.itemsReload$.next();
          this.deletingItemId = null;
        },
        error: () => {
          this.setMessage({ type: 'error', text: 'Не удалось удалить элемент.' });
          this.deletingItemId = null;
        }
      });
  }

  deactivateItem(item: ValueListItem): void {
    this.valueListApi
      .deactivateItem(item.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.setMessage({ type: 'success', text: 'Элемент деактивирован.' });
          this.itemsReload$.next();
        },
        error: () => {
          this.setMessage({ type: 'error', text: 'Не удалось деактивировать элемент.' });
        }
      });
  }

  trackByListId(_: number, item: ValueList): number {
    return item.id;
  }

  trackByItemId(_: number, item: ValueListItem): number {
    return item.id;
  }

  refresh(): void {
    this.reload$.next();
  }

  private parseJson(value: string): Record<string, string> | undefined | null {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    try {
      return JSON.parse(trimmed);
    } catch (err) {
      this.setMessage({ type: 'error', text: 'Некорректный JSON для локализаций.' });
      return null;
    }
  }

  private setMessage(message: UiMessage): void {
    this.messageSubject.next(message);
    if (this.messageTimeoutHandle !== null) {
      window.clearTimeout(this.messageTimeoutHandle);
    }
    this.messageTimeoutHandle = window.setTimeout(() => this.messageSubject.next(null), 5000);
  }
}
