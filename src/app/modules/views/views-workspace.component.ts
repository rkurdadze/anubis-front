import { AsyncPipe, DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';

import { ObjectViewApi } from '../../core/api/view.api';
import { ObjectView } from '../../core/models/object-view.model';
import { RepositoryObject } from '../../core/models/object.model';
import { ObjectVersion } from '../../core/models/object-version.model';
import { ToastService, ToastType } from '../../shared/services/toast.service';

@Component({
  selector: 'app-views-workspace',
  standalone: true,
  imports: [AsyncPipe, NgIf, NgFor, NgClass, ReactiveFormsModule, DatePipe],
  templateUrl: './views-workspace.component.html',
  styleUrls: ['./views-workspace.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ViewsWorkspaceComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly objectViewApi = inject(ObjectViewApi);
  private readonly toast = inject(ToastService);
  private readonly destroy$ = new Subject<void>();
  private readonly viewsSubject = new BehaviorSubject<ObjectView[]>([]);
  private readonly resultsSubject = new BehaviorSubject<RepositoryObject[]>([]);
  private readonly aclResultsSubject = new BehaviorSubject<ObjectVersion[]>([]);
  selectedView: ObjectView | null = null;
  isViewFormOpen = false;

  readonly views$ = this.viewsSubject.asObservable();
  readonly executionResults$ = this.resultsSubject.asObservable();
  readonly aclResults$ = this.aclResultsSubject.asObservable();

  readonly userForm = this.fb.group({
    userId: [1, [Validators.required, Validators.min(1)]],
    executeForUserId: [1, [Validators.required, Validators.min(1)]]
  });

  readonly viewForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    isCommon: [false],
    sortOrder: [0],
    filterJson: [''],
    groupingsJson: ['']
  });

  isSaving = false;
  isLoading = false;
  isExecuting = false;

  ngOnInit(): void {
    this.loadViews();
  }

  loadViews(): void {
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }

    const userId = this.userForm.get('userId')!.value ?? 0;
    this.isLoading = true;
    this.objectViewApi
      .available(userId)
      .pipe(
        catchError(() => {
          this.showMessage('error', 'Не удалось загрузить представления.');
          return of<ObjectView[]>([]);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe(views => {
        this.viewsSubject.next(views);
        if (this.selectedView) {
          const updated = views.find(view => view.id === this.selectedView!.id) ?? null;
          if (updated) {
            this.applySelection(updated);
          } else {
            this.resetForm();
          }
        }
        this.isLoading = false;
      });
  }

  selectView(view: ObjectView): void {
    this.applySelection(view);
    this.isViewFormOpen = true;
  }

  createView(): void {
    this.selectedView = null;
    this.viewForm.reset({ name: '', isCommon: false, sortOrder: 0, filterJson: '', groupingsJson: '' });
    this.isViewFormOpen = true;
  }

  closeViewForm(): void {
    if (this.selectedView) {
      this.isViewFormOpen = false;
      return;
    }
    this.resetForm();
  }

  cancelViewChanges(): void {
    if (this.selectedView) {
      this.applySelection(this.selectedView);
      return;
    }
    this.resetForm();
  }

  get viewPrimaryButtonLabel(): string {
    if (!this.isViewFormOpen) {
      return 'Новое представление';
    }
    return 'Сохранить представление';
  }

  get viewPrimaryButtonIcon(): string {
    if (!this.isViewFormOpen) {
      return 'fa-solid fa-plus';
    }
    return this.viewForm.valid ? 'fa-solid fa-floppy-disk' : 'fa-solid fa-pen';
  }

  get viewPrimaryButtonClasses(): string {
    if (!this.isViewFormOpen) {
      return 'btn btn-primary';
    }
    return this.viewForm.valid ? 'btn btn-success' : 'btn btn-outline-primary';
  }

  handleViewPrimaryAction(): void {
    if (!this.isViewFormOpen) {
      this.createView();
      return;
    }
    this.saveView();
  }

  saveView(): void {
    if (this.viewForm.invalid) {
      this.viewForm.markAllAsTouched();
      return;
    }

    const filter = this.parseJson(this.viewForm.value.filterJson ?? '');
    if (filter === null) {
      return;
    }
    const groupings = this.parseJson(this.viewForm.value.groupingsJson ?? '', true);
    if (groupings === null) {
      return;
    }

    const payload: ObjectView = {
      id: this.selectedView?.id ?? 0,
      name: this.viewForm.value.name!.trim(),
      isCommon: this.viewForm.value.isCommon ?? false,
      sortOrder: this.viewForm.value.sortOrder ?? undefined,
      filterJson: filter ? JSON.stringify(filter) : undefined,
      groupings: Array.isArray(groupings) ? groupings : undefined,
      createdById: this.selectedView?.createdById ?? this.userForm.get('userId')!.value ?? undefined
    };

    this.isSaving = true;

    const save$ = this.selectedView
      ? this.objectViewApi.update(this.selectedView.id, payload)
      : this.objectViewApi.create(payload);

    save$
      .pipe(
        catchError(() => {
          this.showMessage('error', 'Не удалось сохранить представление.');
          this.isSaving = false;
          return of<ObjectView | null>(null);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe(result => {
        if (!result) {
          return;
        }
        this.showMessage('success', `Представление «${result.name}» сохранено.`);
        this.isSaving = false;
        this.loadViews();
        this.applySelection(result);
      });
  }

  deleteView(view: ObjectView): void {
    if (!window.confirm(`Удалить представление «${view.name}»?`)) {
      return;
    }

    this.objectViewApi
      .delete(view.id)
      .pipe(
        catchError(() => {
          this.showMessage('error', 'Не удалось удалить представление.');
          return of<void>(undefined);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.showMessage('success', `Представление «${view.name}» удалено.`);
        if (this.selectedView?.id === view.id) {
          this.resetForm();
        }
        this.loadViews();
      });
  }

  executeView(view: ObjectView): void {
    this.isExecuting = true;
    this.objectViewApi
      .execute(view.id)
      .pipe(
        catchError(() => {
          this.showMessage('error', 'Не удалось выполнить представление.');
          this.isExecuting = false;
          return of<RepositoryObject[]>([]);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe(result => {
        this.resultsSubject.next(result);
        this.isExecuting = false;
      });
  }

  executeViewWithAcl(view: ObjectView): void {
    if (this.userForm.get('executeForUserId')!.invalid) {
      this.userForm.get('executeForUserId')!.markAsTouched();
      return;
    }

    const userId = this.userForm.get('executeForUserId')!.value ?? 0;
    this.objectViewApi
      .executeWithAcl(view.id, userId)
      .pipe(
        catchError(() => {
          this.showMessage('error', 'Не удалось выполнить представление с учётом ACL.');
          return of<ObjectVersion[]>([]);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe(result => {
        this.aclResultsSubject.next(result);
      });
  }

  trackByViewId(_: number, item: ObjectView): number {
    return item.id;
  }

  private applySelection(view: ObjectView): void {
    this.selectedView = view;
    this.viewForm.reset({
      name: view.name,
      isCommon: view.isCommon ?? false,
      sortOrder: view.sortOrder ?? 0,
      filterJson: view.filterJson ? view.filterJson : '',
      groupingsJson: view.groupings ? JSON.stringify(view.groupings, null, 2) : ''
    });
    this.isViewFormOpen = true;
  }

  private resetForm(): void {
    this.selectedView = null;
    this.viewForm.reset({ name: '', isCommon: false, sortOrder: 0, filterJson: '', groupingsJson: '' });
    this.resultsSubject.next([]);
    this.aclResultsSubject.next([]);
    this.isViewFormOpen = false;
  }

  private parseJson(value: string, expectArray = false): any[] | Record<string, unknown> | undefined | null {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (expectArray && !Array.isArray(parsed)) {
        this.showMessage('error', 'Группировки должны быть массивом объектов.');
        return null;
      }
      return parsed;
    } catch (err) {
      this.showMessage('error', 'Неверный JSON формат.');
      return null;
    }
  }

  private showMessage(type: ToastType, text: string): void {
    this.toast.show(type, text);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
