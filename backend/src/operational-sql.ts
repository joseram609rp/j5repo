import type { SqlUnit } from './sql.js';
import type { OperationalFilters, OperationalMechanic, OperationalOrder, OperationalReport, OperationalTotals } from './operational-types.js';

const workScope = `
  o.order_date>=@from AND o.order_date<=@to
  AND (@mechanic IS NULL OR o.mechanic_id=CONVERT(uniqueidentifier,@mechanic))
  AND (@includeBackfilled=1 OR o.is_backfilled=0)
`;
const itemTotals = `
  SELECT COUNT(*) AS services, CONVERT(decimal(19,2),COALESCE(SUM(ROUND(i.price*o.tax_rate/100,2)),0)) AS tax
  FROM dbo.OrderItems i WHERE i.order_id=o.id
`;
const week = (column: string) => `DATEADD(day,-(DATEDIFF(day,'19000101',${column})%7+7)%7,${column})`;
const params = (filters: OperationalFilters) => ({ ...filters, mechanic: filters.mechanic ?? null });

type WorkRow = OperationalTotals & { mechanic: string | null; date: string | null; method: string | null };
type ClosureRow = { date: string | null; week: string | null; mechanic: string | null; closed: number; durationMs: number | null };

export async function readOperationalReport(tx: SqlUnit, filters: OperationalFilters, now: number): Promise<OperationalReport> {
  const today = new Date(now - 6 * 3_600_000).toISOString().slice(0, 10);
  const result = await tx.query(`
    WITH work AS (
      SELECT o.mechanic_id, o.order_date, o.status,
        CASE WHEN o.status='CLOSED' THEN o.total_amount ELSE 0 END AS gross,
        CASE WHEN o.status='CLOSED' THEN i.tax ELSE 0 END AS tax,
        CASE WHEN o.status='CLOSED' THEN i.services ELSE 0 END AS services,
        CASE WHEN o.status='OPEN' THEN NULL
          WHEN d.method IN ('SINPE','CASH','CREDIT_CARD','DEBIT_CARD','BANK_TRANSFER') THEN d.method
          ELSE 'UNRECORDED' END AS method,
        CASE WHEN o.status='CLOSED' AND d.requiresInvoice=1 THEN 1 ELSE 0 END AS required,
        CASE WHEN o.status='CLOSED' AND d.requiresInvoice=1 AND COALESCE(t.is_issued,0)=0
          THEN DATEDIFF(day,o.order_date,@today) END AS pendingDays
      FROM dbo.Orders o
      OUTER APPLY (${itemTotals}) i
      OUTER APPLY (
        SELECT MAX(CASE WHEN [key]='paymentMethod' AND [type]=1 THEN CONVERT(nvarchar(32),[value]) END) AS method,
          MAX(CASE WHEN [key]='electronicInvoice' AND [type]=3 AND [value]='true' THEN 1 ELSE 0 END) AS requiresInvoice
        FROM OPENJSON(o.draft_data)
      ) d
      LEFT JOIN dbo.OrderInvoiceTracking t ON t.order_id=o.id
      WHERE o.status IN ('OPEN','CLOSED') AND ${workScope}
    )
    SELECT mechanic_id AS mechanic, CONVERT(char(10),order_date,23) AS date, method,
      COUNT(CASE WHEN status='CLOSED' THEN 1 END) AS closed,
      COUNT(CASE WHEN status='OPEN' THEN 1 END) AS [open],
      COALESCE(SUM(services),0) AS services, COALESCE(SUM(gross),0) AS gross,
      COALESCE(SUM(tax),0) AS tax,
      COALESCE(SUM(CONVERT(decimal(30,2),gross-tax)),0) AS net,
      COALESCE(SUM(required),0) AS required, COUNT(pendingDays) AS pending,
      MAX(pendingDays) AS oldestPendingDays
    FROM work GROUP BY GROUPING SETS ((),(mechanic_id),(order_date),(method))
    HAVING GROUPING(method)=1 OR method IS NOT NULL
    OPTION (RECOMPILE);

    SELECT id, full_name AS name FROM dbo.Users u
    WHERE u.role='MECHANIC' OR EXISTS (SELECT 1 FROM dbo.Orders o WHERE o.mechanic_id=u.id)
    ORDER BY full_name,id;

    DECLARE @closeFrom datetime2(3)=DATEADD(hour,6,CONVERT(datetime2(3),@from));
    DECLARE @closeEnd datetime2(3)=DATEADD(hour,6,DATEADD(day,1,CONVERT(datetime2(3),@to)));
    WITH closures AS (
      SELECT o.mechanic_id, CONVERT(date,DATEADD(hour,-6,o.closed_at)) AS localDate,
        DATEDIFF_BIG(millisecond,o.created_at,o.closed_at) AS duration
      FROM dbo.Orders o
      WHERE o.status='CLOSED' AND o.is_backfilled=0 AND o.closed_at>=@closeFrom AND o.closed_at<@closeEnd
        AND (@mechanic IS NULL OR o.mechanic_id=CONVERT(uniqueidentifier,@mechanic))
    ), periods AS (
      SELECT *, ${week('localDate')} AS monday FROM closures
    )
    SELECT mechanic_id AS mechanic, CONVERT(char(10),localDate,23) AS date,
      CONVERT(char(10),monday,23) AS week, COUNT(*) AS closed,
      AVG(CONVERT(float,CASE WHEN duration>=0 THEN duration END)) AS durationMs
    FROM periods GROUP BY GROUPING SETS ((localDate),(mechanic_id,localDate),(mechanic_id,monday))
    OPTION (RECOMPILE);

    DECLARE @monday date=${week('CONVERT(date,@to)')};
    DECLARE @current datetime2(3)=DATEADD(hour,6,CONVERT(datetime2(3),@monday));
    DECLARE @currentEnd datetime2(3)=@closeEnd;
    SELECT o.mechanic_id AS mechanic,
      COUNT(CASE WHEN o.closed_at>=@current THEN 1 END) AS [current],
      COUNT(CASE WHEN o.closed_at<DATEADD(day,-7,@currentEnd) THEN 1 END) AS previous
    FROM dbo.Orders o
    WHERE o.status='CLOSED' AND o.is_backfilled=0
      AND o.closed_at>=DATEADD(day,-7,@current) AND o.closed_at<@currentEnd
      AND (@mechanic IS NULL OR o.mechanic_id=CONVERT(uniqueidentifier,@mechanic))
    GROUP BY o.mechanic_id OPTION (RECOMPILE);

    SELECT CONVERT(char(10),@monday,23) AS comparisonWeek, @to AS comparisonThrough;
  `, { ...params(filters), today });
  const [work, mechanics, closures, comparison, period] = result.recordsets as unknown as [
    WorkRow[], OperationalMechanic[], ClosureRow[], OperationalReport['comparison'],
    Pick<OperationalReport,'comparisonWeek'|'comparisonThrough'>[],
  ];
  const totals = ({ mechanic, date, method, ...values }: WorkRow) => values;
  return {
    ...period[0]!,
    totals: totals(work.find(row => !row.mechanic && !row.date && !row.method)!),
    mechanics,
    productivity: work.flatMap(row => {
      const mechanic = mechanics.find(candidate => candidate.id === row.mechanic);
      return mechanic ? [{ ...totals(row), ...mechanic }] : [];
    }),
    workDays: work.flatMap(row => row.date ? [{ ...totals(row), date: row.date }] : [])
      .sort((a,b) => a.date.localeCompare(b.date)),
    payments: work.flatMap(row => row.method ? [{ method: row.method, gross: row.gross, closed: row.closed }] : []),
    closureDays: closures.flatMap(row => row.date && !row.mechanic ? [{ date: row.date, closed: row.closed, durationMs: row.durationMs }] : [])
      .sort((a,b) => a.date.localeCompare(b.date)),
    closureByMechanicDay: closures.flatMap(row => row.date && row.mechanic ? [{ date: row.date, mechanic: row.mechanic, closed: row.closed }] : [])
      .sort((a,b) => a.date.localeCompare(b.date)),
    closureWeeks: closures.flatMap(row => row.week && row.mechanic ? [{ week: row.week, mechanic: row.mechanic, closed: row.closed }] : [])
      .sort((a,b) => a.week.localeCompare(b.week)),
    comparison,
  };
}

export async function readOperationalOrders(tx: SqlUnit, filters: OperationalFilters, status: 'OPEN' | 'CLOSED', page: number) {
  const pageSize = 25;
  const result = await tx.query<OperationalOrder>(`
    WITH page AS (
      SELECT o.id,o.display_order_id,o.order_date,o.customer_name_snapshot,o.plate_snapshot,
        o.status,o.is_backfilled,o.total_amount,o.tax_rate
      FROM dbo.Orders o WHERE o.status=@status AND ${workScope}
      ORDER BY o.order_date DESC,o.id DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    )
    SELECT o.id,o.display_order_id AS orderNumber,CONVERT(char(10),o.order_date,23) AS workDate,
      o.customer_name_snapshot AS customer,o.plate_snapshot AS plate,o.status,o.is_backfilled AS backfilled,
      i.services,o.total_amount AS gross,CONVERT(decimal(12,2),o.total_amount-i.tax) AS net
    FROM page o CROSS APPLY (${itemTotals}) i ORDER BY o.order_date DESC,o.id DESC OPTION (RECOMPILE);
  `, { ...params(filters), status, offset: page * pageSize, limit: pageSize + 1 });
  return { rows: result.recordset.slice(0, pageSize), more: page < 199 && result.recordset.length > pageSize };
}
