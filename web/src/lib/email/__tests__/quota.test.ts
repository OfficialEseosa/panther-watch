import { describe, expect, it } from "vitest";
import {
  EMAIL_DAILY_LIMIT,
  EMAIL_MONTHLY_LIMIT,
  remainingBudget,
  utcDayStart,
  utcMonthStart,
} from "../quota";

describe("remainingBudget", () => {
  it("matches Resend's free tier", () => {
    expect(EMAIL_DAILY_LIMIT).toBe(100);
    expect(EMAIL_MONTHLY_LIMIT).toBe(3000);
  });

  it("gives the watcher everything except the reserve when nothing is sent", () => {
    expect(remainingBudget({ sentTodayUtc: 0, sentThisMonthUtc: 0 })).toEqual({
      dailyRemaining: 100,
      monthlyRemaining: 3000,
      watcherBudget: 90,
    });
  });

  it("holds the default reserve of 10 back from the watcher", () => {
    expect(remainingBudget({ sentTodayUtc: 89, sentThisMonthUtc: 89 }).watcherBudget).toBe(1);
    expect(remainingBudget({ sentTodayUtc: 90, sentThisMonthUtc: 90 }).watcherBudget).toBe(0);
  });

  it("at 99/100 today leaves 1 for welcome/goodbye and none for the watcher", () => {
    const budget = remainingBudget({ sentTodayUtc: 99, sentThisMonthUtc: 500 });
    expect(budget.dailyRemaining).toBe(1);
    expect(budget.watcherBudget).toBe(0);
    expect(remainingBudget({ sentTodayUtc: 99, sentThisMonthUtc: 500, reserve: 0 }).watcherBudget).toBe(1);
  });

  it("at 100/100 today leaves nothing for anyone", () => {
    expect(remainingBudget({ sentTodayUtc: 100, sentThisMonthUtc: 500, reserve: 0 })).toEqual({
      dailyRemaining: 0,
      monthlyRemaining: 2500,
      watcherBudget: 0,
    });
  });

  it("at 2995/3000 this month the monthly window is the binding one", () => {
    const budget = remainingBudget({ sentTodayUtc: 0, sentThisMonthUtc: 2995 });
    expect(budget.monthlyRemaining).toBe(5);
    expect(budget.dailyRemaining).toBe(100);
    expect(budget.watcherBudget).toBe(0);
    expect(remainingBudget({ sentTodayUtc: 0, sentThisMonthUtc: 2995, reserve: 0 }).watcherBudget).toBe(5);
    expect(remainingBudget({ sentTodayUtc: 0, sentThisMonthUtc: 2995, reserve: 3 }).watcherBudget).toBe(2);
  });

  it("clamps over-limit and invalid counts", () => {
    expect(remainingBudget({ sentTodayUtc: 150, sentThisMonthUtc: 3100 })).toEqual({
      dailyRemaining: 0,
      monthlyRemaining: 0,
      watcherBudget: 0,
    });
    expect(remainingBudget({ sentTodayUtc: -5, sentThisMonthUtc: Number.NaN, reserve: -1 })).toEqual({
      dailyRemaining: 100,
      monthlyRemaining: 3000,
      watcherBudget: 100,
    });
  });
});

describe("UTC windows", () => {
  it("start at midnight UTC regardless of local offset", () => {
    const now = new Date("2026-10-31T23:30:00-04:00"); // 03:30Z on Nov 1
    expect(utcDayStart(now).toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(utcMonthStart(now).toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(utcMonthStart(new Date("2026-10-25T12:00:00Z")).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
});
