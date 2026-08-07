import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { reportPeriodSchema, reportTrendSchema } from '@/types/report'
import type { ReportPeriod, ReportTrend } from '@/types/report'

/*
 * The dashboard's entire data source (architecture-spec §3.4).
 *
 * Every figure the owner reads passes through `reportPeriodSchema.parse` here.
 * If the document does not match, this throws and the screen shows an error
 * instead of numbers — which is the intended behaviour: a wrong number is worse
 * than a crash, because nobody notices (plan §5.2).
 *
 * The app does no arithmetic on any of it (architecture-spec §1.2).
 */

export const reportQueryKey = ['report_period'] as const

export function useReportPeriod(from: string, to: string) {
  return useQuery({
    queryKey: [...reportQueryKey, from, to] as const,
    queryFn: async (): Promise<ReportPeriod> => {
      const { data, error } = await supabase.rpc('report_period', { p_from: from, p_to: to })
      if (error) throw error
      return reportPeriodSchema.parse(data)
    },
  })
}

export function useReportTrend(months = 12) {
  return useQuery({
    queryKey: ['report_trend', months] as const,
    queryFn: async (): Promise<ReportTrend> => {
      const { data, error } = await supabase.rpc('report_trend', { p_months: months })
      if (error) throw error
      return reportTrendSchema.parse(data)
    },
  })
}
