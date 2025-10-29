import { AsyncPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, takeUntil, tap } from 'rxjs/operators';

import { SearchApi } from '../../../../core/api/search.api';

interface UiMessage {
  type: 'success' | 'error';
  text: string;
}

@Component({
  selector: 'app-search-center',
  standalone: true,
  imports: [AsyncPipe, NgIf, NgFor, NgClass, ReactiveFormsModule],
  templateUrl: './search-center.component.html',
  styleUrls: ['./search-center.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SearchCenterComponent implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly searchApi = inject(SearchApi);
  private readonly destroy$ = new Subject<void>();
  private readonly resultsSubject = new BehaviorSubject<number[]>([]);
  private readonly messageSubject = new BehaviorSubject<UiMessage | null>(null);
  private messageTimeoutHandle: number | null = null;

  readonly results$ = this.resultsSubject.asObservable();
  readonly message$ = this.messageSubject.asObservable();

  readonly searchForm = this.fb.group({
    query: ['', [Validators.required, Validators.minLength(3)]],
    auto: [true]
  });

  isSearching = false;
  isReindexing = false;
  reindexVersionId: number | null = null;

  constructor() {
    this.searchForm
      .get('query')!
      .valueChanges.pipe(
        debounceTime(300),
        distinctUntilChanged(),
        tap(() => {
          if (this.searchForm.get('auto')!.value) {
            this.performSearch();
          }
        }),
        takeUntil(this.destroy$)
      )
      .subscribe();
  }

  performSearch(): void {
    const query = this.searchForm.get('query')!.value?.trim();
    if (!query || query.length < 3) {
      this.resultsSubject.next([]);
      return;
    }

    this.isSearching = true;
    this.searchApi
      .search(query)
      .pipe(
        catchError(() => {
          this.setMessage({ type: 'error', text: 'Не удалось выполнить поиск.' });
          return of<number[]>([]);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe(results => {
        this.resultsSubject.next(results);
        this.isSearching = false;
      });
  }

  clearQuery(): void {
    this.searchForm.reset({ query: '', auto: true });
    this.resultsSubject.next([]);
  }

  reindexAll(): void {
    if (this.isReindexing) {
      return;
    }

    this.isReindexing = true;
    this.searchApi
      .reindexAll()
      .pipe(
        catchError(() => {
          this.setMessage({ type: 'error', text: 'Не удалось запустить переиндексацию.' });
          return of('');
        }),
        takeUntil(this.destroy$)
      )
      .subscribe(message => {
        if (message) {
          this.setMessage({ type: 'success', text: message });
        }
        this.isReindexing = false;
      });
  }

  reindexVersion(versionId: number): void {
    if (this.reindexVersionId !== null) {
      return;
    }

    this.reindexVersionId = versionId;
    this.searchApi
      .reindexVersion(versionId)
      .pipe(
        catchError(() => {
          this.setMessage({ type: 'error', text: 'Не удалось переиндексировать версию.' });
          return of('');
        }),
        takeUntil(this.destroy$)
      )
      .subscribe(message => {
        if (message) {
          this.setMessage({ type: 'success', text: message });
        }
        this.reindexVersionId = null;
      });
  }

  trackById(_: number, item: number): number {
    return item;
  }

  private setMessage(message: UiMessage): void {
    this.messageSubject.next(message);
    if (this.messageTimeoutHandle !== null) {
      window.clearTimeout(this.messageTimeoutHandle);
    }
    this.messageTimeoutHandle = window.setTimeout(() => this.messageSubject.next(null), 5000);
  }

  ngOnDestroy(): void {
    if (this.messageTimeoutHandle !== null) {
      window.clearTimeout(this.messageTimeoutHandle);
    }
    this.destroy$.next();
    this.destroy$.complete();
  }
}
