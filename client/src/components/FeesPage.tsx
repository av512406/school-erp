import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText } from "lucide-react";
import PayslipModal from "./PayslipModal";
import type { Student } from '@shared/schema';

export interface FeeTransaction {
  id: string;
  studentId: string;
  studentName: string;
  amount: number;
  date: string;
  transactionId: string;
}

interface FeesPageProps {
  students: Student[];
  transactions: FeeTransaction[];
  // returns the created transaction (with id and transactionId)
  onAddTransaction: (transaction: Omit<FeeTransaction, 'id' | 'transactionId'>) => FeeTransaction;
}

export default function FeesPage({ students, transactions, onAddTransaction }: FeesPageProps) {
  const [selectedStudent, setSelectedStudent] = useState("");
  const [viewStudent, setViewStudent] = useState("all");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedPayslip, setSelectedPayslip] = useState<FeeTransaction | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const student = students.find(s => s.id === selectedStudent);
    if (student) {
      const created = onAddTransaction({
        studentId: student.id,
        studentName: student.name,
        amount: parseFloat(amount),
        date
      });
      // open payslip for the newly created transaction
      setSelectedPayslip(created);
      setSelectedStudent("");
      setAmount("");
      setDate(new Date().toISOString().split('T')[0]);
    }
  };

  // compute viewed student's totals
  const viewedStudent = viewStudent === 'all' ? null : (students.find(s => s.id === viewStudent) || null);
  const studentTransactions = viewStudent === 'all' ? [] : transactions.filter(t => t.studentId === viewStudent);
  const totalPaid = studentTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
  const yearlyFee = viewedStudent ? parseFloat((viewedStudent as any).yearlyFeeAmount || '0') : 0;
  const balance = yearlyFee - totalPaid;

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Fee Management</h1>
        <p className="text-muted-foreground">Record and track student fee payments</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Record Payment</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="student">Student</Label>
                <Select value={selectedStudent} onValueChange={setSelectedStudent} required>
                  <SelectTrigger id="student" data-testid="select-student">
                    <SelectValue placeholder="Select a student" />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map((student) => (
                      <SelectItem key={student.id} value={student.id}>
                        {student.name} ({student.admissionNumber})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (₹)</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  data-testid="input-amount"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Payment Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  data-testid="input-date"
                />
              </div>
              <Button type="submit" className="w-full" data-testid="button-record-payment">
                Record Payment
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>View Student</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="view-student">Student</Label>
                  <Select value={viewStudent} onValueChange={setViewStudent}>
                    <SelectTrigger id="view-student">
                      <SelectValue placeholder="Select a student to view" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All students</SelectItem>
                      {students.map((student) => (
                        <SelectItem key={student.id} value={student.id}>
                          {student.name} ({student.admissionNumber})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {viewedStudent && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Yearly Fee</p>
                    <p className="text-lg font-semibold">₹{yearlyFee.toLocaleString('en-IN')}</p>
                    <p className="text-sm text-muted-foreground">Total Paid</p>
                    <p className="text-lg font-semibold">₹{totalPaid.toLocaleString('en-IN')}</p>
                    <p className="text-sm text-muted-foreground">Balance</p>
                    <p className={`text-lg font-semibold ${balance <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ₹{balance.toLocaleString('en-IN')}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Payment History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Transaction ID</TableHead>
                      <TableHead>Student Name</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No transactions recorded yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      (viewStudent ? studentTransactions : transactions).map((transaction) => (
                        <TableRow key={transaction.id} data-testid={`row-transaction-${transaction.id}`}>
                          <TableCell className="font-mono text-sm">{transaction.transactionId}</TableCell>
                          <TableCell className="font-medium">{transaction.studentName}</TableCell>
                          <TableCell className="font-semibold">₹{transaction.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                          <TableCell>{new Date(transaction.date).toLocaleDateString()}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedPayslip(transaction)}
                              className="gap-2"
                              data-testid={`button-payslip-${transaction.id}`}
                            >
                              <FileText className="w-4 h-4" />
                              Payslip
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <PayslipModal
        transaction={selectedPayslip}
        isOpen={!!selectedPayslip}
        onClose={() => setSelectedPayslip(null)}
      />
    </div>
  );
}
