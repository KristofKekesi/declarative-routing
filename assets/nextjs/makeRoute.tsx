/*
Derived from: https://www.flightcontrol.dev/blog/fix-nextjs-routing-to-have-full-type-safety
*/
import { z } from "zod";
import queryString from "query-string";
import Link from "next/link";

type LinkProps = Parameters<typeof Link>[0];

export type RouteInfo<
  Params extends z.ZodSchema,
  Search extends z.ZodSchema,
  Anchor extends z.ZodSchema
> = {
  name: string;
  params: Params;
  search: Search;
  anchor: Anchor;
  description?: string;
};

export type GetInfo<Result extends z.ZodSchema> = {
  result: Result;
};

export type PostInfo<Body extends z.ZodSchema, Result extends z.ZodSchema> = {
  body: Body;
  result: Result;
  description?: string;
};

export type PutInfo<Body extends z.ZodSchema, Result extends z.ZodSchema> = {
  body: Body;
  result: Result;
  description?: string;
};

type FetchOptions = Parameters<typeof fetch>[1];

type CoreRouteElements<
  Params extends z.ZodSchema,
  Search extends z.ZodSchema = typeof emptySchema,
  Anchor extends z.ZodSchema = typeof emptySchema
> = {
  params: z.output<Params>;
  paramsSchema: Params;
  search: z.output<Search>;
  searchSchema: Search;
  anchor: z.output<Anchor>;
  anchorSchema: Anchor;
};

type PutRouteBuilder<
  Params extends z.ZodSchema,
  Search extends z.ZodSchema,
  Anchor extends z.ZodSchema,
  Body extends z.ZodSchema,
  Result extends z.ZodSchema
> = CoreRouteElements<Params, Search, Anchor> & {
  (
    body: z.input<Body>,
    p?: z.input<Params>,
    search?: z.input<Search>,
    anchor?: z.input<Anchor>,
    options?: FetchOptions
  ): Promise<z.output<Result>>;

  body: z.output<Body>;
  bodySchema: Body;
  result: z.output<Result>;
  resultSchema: Result;
  anchor: z.output<Anchor>;
  anchorSchema: Anchor;
};

type PostRouteBuilder<
  Params extends z.ZodSchema,
  Search extends z.ZodSchema,
  Anchor extends z.ZodSchema,
  Body extends z.ZodSchema,
  Result extends z.ZodSchema
> = CoreRouteElements<Params, Search, Anchor> & {
  (
    body: z.input<Body>,
    p?: z.input<Params>,
    search?: z.input<Search>,
    anchor?: z.input<Anchor>,
    options?: FetchOptions
  ): Promise<z.output<Result>>;

  body: z.output<Body>;
  bodySchema: Body;
  result: z.output<Result>;
  resultSchema: Result;
};

type GetRouteBuilder<
  Params extends z.ZodSchema,
  Search extends z.ZodSchema,
  Anchor extends z.ZodSchema,
  Result extends z.ZodSchema
> = CoreRouteElements<Params, Search, Anchor> & {
  (
    p?: z.input<Params>,
    search?: z.input<Search>,
    anchor?: z.input<Anchor>,
    options?: FetchOptions
  ): Promise<z.output<Result>>;

  result: z.output<Result>;
  resultSchema: Result;
};

type DeleteRouteBuilder<Params extends z.ZodSchema> = CoreRouteElements<
  Params,
  z.ZodSchema
> & {
  (p?: z.input<Params>, options?: FetchOptions): Promise<void>;
};

export type RouteBuilder<
  Params extends z.ZodSchema,
  Search extends z.ZodSchema,
  Anchor extends z.ZodSchema,
> = CoreRouteElements<Params, Search, Anchor> & {
  (p?: z.input<Params>, search?: z.input<Search>, anchor?: z.input<Anchor>): string;

  routeName: string;

  Link: React.FC<
    Omit<LinkProps, "href"> &
      z.input<Params> & {
        search?: z.input<Search>;
        anchor?: z.input<Anchor>;
      } & { children?: React.ReactNode }
  >;
  ParamsLink: React.FC<
    Omit<LinkProps, "href"> & {
      params?: z.input<Params>;
      search?: z.input<Search>;
      anchor?: z.input<Anchor>;
    } & { children?: React.ReactNode }
  >;
};

function createPathBuilder<T extends Record<string, string | string[]>>(
  route: string
): (params: T) => string {
  const pathArr = route.split("/");

  let catchAllSegment: ((params: T) => string) | null = null;
  if (pathArr.at(-1)?.startsWith("[[...")) {
    const catchKey = pathArr.pop()!.replace("[[...", "").replace("]]", "");
    catchAllSegment = (params: T) => {
      const catchAll = params[catchKey] as unknown as string[];
      return catchAll ? `/${catchAll.join("/")}` : "";
    };
  }

  const elems: ((params: T) => string)[] = [];
  for (const elem of pathArr) {
    const catchAll = elem.match(/\[\.\.\.(.*)\]/);
    const param = elem.match(/\[(.*)\]/);
    if (catchAll?.[1]) {
      const key = catchAll[1];
      elems.push((params: T) =>
        (params[key as unknown as string] as string[]).join("/")
      );
    } else if (param?.[1]) {
      const key = param[1];
      elems.push((params: T) => params[key as unknown as string] as string);
    } else if (!(elem.startsWith("(") && elem.endsWith(")"))) {
      elems.push(() => elem);
    }
  }

  return (params: T): string => {
    const p = elems.map((e) => e(params)).join("/");
    if (catchAllSegment) {
      return p + catchAllSegment(params);
    } else {
      return p;
    }
  };
}

function createRouteBuilder<
  Params extends z.ZodSchema,
  Search extends z.ZodSchema,
  Anchor extends z.ZodSchema
>(route: string, info: RouteInfo<Params, Search, Anchor>) {
  const fn = createPathBuilder<z.output<Params>>(route);

  return (params?: z.input<Params>, search?: z.input<Search>, anchor?: z.input<Anchor>) => {
    let checkedParams = params || {};
    if (info.params) {
      const safeParams = info.params.safeParse(checkedParams);
      if (!safeParams?.success) {
        throw new Error(
          `Invalid params for route ${info.name}: ${safeParams.error.message}`
        );
      } else {
        checkedParams = safeParams.data;
      }
    }
    const safeSearch = info.search
      ? info.search?.safeParse(search || {})
      : null;
    if (info.search && !safeSearch?.success) {
      throw new Error(
        `Invalid search params for route ${info.name}: ${safeSearch?.error.message}`
      );
    }

    const baseUrl = fn(checkedParams);
    const searchString = search && queryString.stringify(search);
    return [baseUrl, searchString ? `?${searchString}` : "", anchor ? `#${anchor}` : ""].join("");
  };
}

const emptySchema = z.object({});

export function makePostRoute<
  Params extends z.ZodSchema,
  Search extends z.ZodSchema,
  Anchor extends z.ZodSchema,
  Body extends z.ZodSchema,
  Result extends z.ZodSchema
>(
  route: string,
  info: RouteInfo<Params, Search, Anchor>,
  postInfo: PostInfo<Body, Result>
): PostRouteBuilder<Params, Search, Anchor, Body, Result> {
  const urlBuilder = createRouteBuilder(route, info);

  const routeBuilder: PostRouteBuilder<Params, Search, Anchor, Body, Result> = (
    body: z.input<Body>,
    p?: z.input<Params>,
    search?: z.input<Search>,
    anchor?: z.input<Anchor>,
    options?: FetchOptions
  ): Promise<z.output<Result>> => {
    const safeBody = postInfo.body.safeParse(body);
    if (!safeBody.success) {
      throw new Error(
        `Invalid body for route ${info.name}: ${safeBody.error.message}`
      );
    }

    return fetch(urlBuilder(p, search, anchor), {
      ...options,
      method: "POST",
      body: JSON.stringify(safeBody.data),
      headers: {
        ...(options?.headers || {}),
        "Content-Type": "application/json"
      }
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch ${info.name}: ${res.statusText}`);
        }
        return res.json() as Promise<z.output<Result>>;
      })
      .then((data) => {
        const result = postInfo.result.safeParse(data);
        if (!result.success) {
          throw new Error(
            `Invalid response for route ${info.name}: ${result.error.message}`
          );
        }
        return result.data;
      });
  };

  routeBuilder.params = undefined as z.output<Params>;
  routeBuilder.paramsSchema = info.params;
  routeBuilder.search = undefined as z.output<Search>;
  routeBuilder.searchSchema = info.search;
  routeBuilder.anchor = undefined as z.output<Anchor>;
  routeBuilder.anchorSchema = info.anchor;
  routeBuilder.body = undefined as z.output<Body>;
  routeBuilder.bodySchema = postInfo.body;
  routeBuilder.result = undefined as z.output<Result>;
  routeBuilder.resultSchema = postInfo.result;

  return routeBuilder;
}

export function makePutRoute<
  Params extends z.ZodSchema,
  Search extends z.ZodSchema,
  Anchor extends z.ZodSchema,
  Body extends z.ZodSchema,
  Result extends z.ZodSchema
>(
  route: string,
  info: RouteInfo<Params, Search, Anchor>,
  putInfo: PutInfo<Body, Result>
): PutRouteBuilder<Params, Search, Anchor, Body, Result> {
  const urlBuilder = createRouteBuilder(route, info);

  const routeBuilder: PutRouteBuilder<Params, Search, Anchor, Body, Result> = (
    body: z.input<Body>,
    p?: z.input<Params>,
    search?: z.input<Search>,
    anchor?: z.input<Anchor>,
    options?: FetchOptions
  ): Promise<z.output<Result>> => {
    const safeBody = putInfo.body.safeParse(body);
    if (!safeBody.success) {
      throw new Error(
        `Invalid body for route ${info.name}: ${safeBody.error.message}`
      );
    }

    return fetch(urlBuilder(p, search, anchor), {
      ...options,
      method: "PUT",
      body: JSON.stringify(safeBody.data),
      headers: {
        ...(options?.headers || {}),
        "Content-Type": "application/json"
      }
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch ${info.name}: ${res.statusText}`);
        }
        return res.json() as Promise<z.output<Result>>;
      })
      .then((data) => {
        const result = putInfo.result.safeParse(data);
        if (!result.success) {
          throw new Error(
            `Invalid response for route ${info.name}: ${result.error.message}`
          );
        }
        return result.data;
      });
  };

  routeBuilder.params = undefined as z.output<Params>;
  routeBuilder.paramsSchema = info.params;
  routeBuilder.search = undefined as z.output<Search>;
  routeBuilder.searchSchema = info.search;
  routeBuilder.anchor = undefined as z.output<Anchor>;
  routeBuilder.anchorSchema = info.anchor;
  routeBuilder.body = undefined as z.output<Body>;
  routeBuilder.bodySchema = putInfo.body;
  routeBuilder.result = undefined as z.output<Result>;
  routeBuilder.resultSchema = putInfo.result;

  return routeBuilder;
}

export function makeGetRoute<
  Params extends z.ZodSchema,
  Search extends z.ZodSchema,
  Anchor extends z.ZodSchema,
  Result extends z.ZodSchema
>(
  route: string,
  info: RouteInfo<Params, Search, Anchor>,
  getInfo: GetInfo<Result>
): GetRouteBuilder<Params, Search, Anchor, Result> {
  const urlBuilder = createRouteBuilder(route, info);

  const routeBuilder: GetRouteBuilder<Params, Search, Anchor, Result> = (
    p?: z.input<Params>,
    search?: z.input<Search>,
    anchor?: z.input<Anchor>,
    options?: FetchOptions
  ): Promise<z.output<Result>> => {
    return fetch(urlBuilder(p, search, anchor), options)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch ${info.name}: ${res.statusText}`);
        }
        return res.json() as Promise<z.output<Result>>;
      })
      .then((data) => {
        const result = getInfo.result.safeParse(data);
        if (!result.success) {
          throw new Error(
            `Invalid response for route ${info.name}: ${result.error.message}`
          );
        }
        return result.data;
      });
  };

  routeBuilder.params = undefined as z.output<Params>;
  routeBuilder.paramsSchema = info.params;
  routeBuilder.search = undefined as z.output<Search>;
  routeBuilder.searchSchema = info.search;
  routeBuilder.anchor = undefined as z.output<Anchor>;
  routeBuilder.anchorSchema = info.anchor;
  routeBuilder.result = undefined as z.output<Result>;
  routeBuilder.resultSchema = getInfo.result;

  return routeBuilder;
}

export function makeDeleteRoute<
  Params extends z.ZodSchema,
  Search extends z.ZodSchema,
  Anchor extends z.ZodSchema
>(route: string, info: RouteInfo<Params, Search, Anchor>): DeleteRouteBuilder<Params> {
  const urlBuilder = createRouteBuilder(route, info);

  const routeBuilder: DeleteRouteBuilder<Params> = (
    p?: z.input<Params>,
    search?: z.input<Search>,
    anchor?: z.input<Anchor>,
    options?: FetchOptions
  ): Promise<void> => {
    return fetch(urlBuilder(p, search, anchor), options).then((res) => {
      if (!res.ok) {
        throw new Error(`Failed to fetch ${info.name}: ${res.statusText}`);
      }
    });
  };

  routeBuilder.params = undefined as z.output<Params>;
  routeBuilder.paramsSchema = info.params;
  routeBuilder.search = undefined as z.output<Search>;
  routeBuilder.searchSchema = info.search;
  routeBuilder.anchor = undefined as z.output<Anchor>;
  routeBuilder.anchorSchema = info.anchor;

  return routeBuilder;
}

export function makeRoute<
  Params extends z.ZodSchema,
  Search extends z.ZodSchema = typeof emptySchema,
  Anchor extends z.ZodSchema = typeof emptySchema
>(
  route: string,
  info: RouteInfo<Params, Search, Anchor>
): RouteBuilder<Params, Search, Anchor> {
  const urlBuilder: RouteBuilder<Params, Search, Anchor> = createRouteBuilder(
    route,
    info
  ) as RouteBuilder<Params, Search, Anchor>;

  urlBuilder.routeName = info.name;

  urlBuilder.ParamsLink = function RouteLink({
    params: linkParams,
    search: linkSearch,
    anchor: linkAnchor,
    children,
    ...props
  }: Omit<LinkProps, "href"> & {
    params?: z.input<Params>;
    search?: z.input<Search>;
    anchor?: z.input<Anchor>;
  } & { children?: React.ReactNode }) {
    return (
      <Link {...props} href={urlBuilder(linkParams, linkSearch, linkAnchor)}>
        {children}
      </Link>
    );
  };

  urlBuilder.Link = function RouteLink({
    search: linkSearch,
    anchor: linkAnchor,
    children,
    ...props
  }: Omit<LinkProps, "href"> &
    z.input<Params> & {
      search?: z.input<Search>;
      anchor?: z.input<Anchor>;
    } & { children?: React.ReactNode }) {
    const params = info.params.parse(props);
    const extraProps = { ...props };
    for (const key of Object.keys(params)) {
      delete extraProps[key];
    }
    return (
      <Link
        {...extraProps}
        href={urlBuilder(info.params.parse(props), linkSearch, linkAnchor)}
      >
        {children}
      </Link>
    );
  };

  urlBuilder.params = undefined as z.output<Params>;
  urlBuilder.paramsSchema = info.params;
  urlBuilder.search = undefined as z.output<Search>;
  urlBuilder.searchSchema = info.search;
  urlBuilder.anchor = undefined as z.output<Anchor>;
  urlBuilder.anchorSchema = info.anchor;

  return urlBuilder;
}
