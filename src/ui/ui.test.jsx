import { render, screen } from "@testing-library/react"
import { DataTable, PageHeader, StatusPill, toneForStatus } from "./index"

test("unknown status falls back to the waiting tone", () => {
  render(<StatusPill tone={toneForStatus("some_new_status")}>New</StatusPill>)
  expect(screen.getByText("New")).toHaveAttribute("data-tone", "waiting")
})

test("known statuses map to the five tones", () => {
  expect(["received", "preparing", "ready", "rejected", "paid"].map(toneForStatus))
    .toEqual(["waiting", "preparing", "ready", "late", "paid"])
})

test("DataTable shows the empty state instead of an empty table", () => {
  render(<DataTable columns={[{ key: "name", label: "Café" }]} rows={[]} rowKey="id" empty={{ title: "No cafés yet" }} />)
  expect(screen.getByText("No cafés yet")).toBeInTheDocument()
  expect(screen.queryByRole("table")).toBeNull()
})

test("long cell text stays on one line and keeps the full value", () => {
  const name = "The Extraordinarily Long Named Coffee Roasters of Addis"
  render(<DataTable columns={[{ key: "name", label: "Café" }]} rows={[{ id: 1, name }]} rowKey="id" empty={{ title: "x" }} />)
  expect(screen.getByText(name)).toHaveAttribute("title", name)
})

test("PageHeader renders one h1 and the action", () => {
  render(<PageHeader title="Orders" subtitle="Today" action={<button>New order</button>} />)
  expect(screen.getByRole("heading", { level: 1, name: "Orders" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "New order" })).toBeInTheDocument()
})
