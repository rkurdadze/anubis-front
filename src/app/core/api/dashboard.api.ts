import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {ApiHttpService} from '../services/api-http.service';

export interface DashboardDistributionItem {
  typeId: number;
  typeName: string;
  count: number;
  percentage: number;
}

export interface DashboardActivityDay {
  label: string;
  count: number;
}

export interface DashboardActivity {
  days: DashboardActivityDay[];
  total: number;
  max: number;
}

@Injectable({ providedIn: 'root' })
export class DashboardApi {
  private readonly baseUrl = '/v1/dashboard';

  constructor(private readonly http: ApiHttpService) {}

  distribution(): Observable<DashboardDistributionItem[]> {
    return this.http.get<DashboardDistributionItem[]>(`${this.baseUrl}/distribution`);
  }

  activity(days = 7): Observable<DashboardActivity> {
    return this.http.get<DashboardActivity>(`${this.baseUrl}/activity?days=${days}`);
  }
}
