import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiHttpService } from '../services/api-http.service';
import { ObjectLink } from '../models/object-link.model';
import { LinkDirection } from '../models/object-link-direction.enum';

@Injectable({ providedIn: 'root' })
export class ObjectLinkApi {
  private readonly baseUrl = '/v1/links';

  constructor(private readonly http: ApiHttpService) {}

  create(srcId: number, dstId: number, role: string, direction: LinkDirection = LinkDirection.UNI): Observable<ObjectLink> {
    return this.http.post<ObjectLink>(this.baseUrl, undefined, {
      srcId,
      dstId,
      role,
      direction
    });
  }

  delete(srcId: number, dstId: number, role: string): Observable<void> {
    return this.http.delete<void>(this.baseUrl, {
      srcId,
      dstId,
      role
    });
  }

  get(objectId: number): Observable<ObjectLink[]> {
    return this.http.get<ObjectLink[]>(`${this.baseUrl}/${objectId}`);
  }
}
