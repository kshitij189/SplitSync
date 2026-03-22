const { UserDebt, Debt, OptimisedDebt } = require('../models');

/**
 * MinHeap implementation for the greedy debt simplification algorithm.
 */
class MinHeap {
  constructor() {
    this.heap = [];
  }

  push(item) {
    this.heap.push(item);
    this._bubbleUp(this.heap.length - 1);
  }

  pop() {
    if (this.heap.length === 0) return null;
    const top = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  get length() {
    return this.heap.length;
  }

  _bubbleUp(i) {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.heap[parent][0] <= this.heap[i][0]) break;
      [this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]];
      i = parent;
    }
  }

  _sinkDown(i) {
    const n = this.heap.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.heap[left][0] < this.heap[smallest][0]) smallest = left;
      if (right < n && this.heap[right][0] < this.heap[smallest][0]) smallest = right;
      if (smallest === i) break;
      [this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]];
      i = smallest;
    }
  }
}

/**
 * Internal: Add a pairwise debt WITHOUT touching UserDebt.
 */
async function _addPairwiseDebt(groupId, fromUser, toUser, amount) {
  // Check for reverse debt
  const reverse = await Debt.findOne({
    where: { group_id: groupId, from_user: toUser, to_user: fromUser },
  });

  if (reverse) {
    if (reverse.amount > amount) {
      reverse.amount -= amount;
      await reverse.save();
      return;
    } else {
      const remaining = amount - reverse.amount;
      await reverse.destroy();
      if (remaining === 0) return;
      amount = remaining;
    }
  }

  // Create or update forward debt
  const existing = await Debt.findOne({
    where: { group_id: groupId, from_user: fromUser, to_user: toUser },
  });

  if (existing) {
    existing.amount += amount;
    await existing.save();
  } else {
    await Debt.create({
      group_id: groupId,
      from_user: fromUser,
      to_user: toUser,
      amount,
    });
  }
}

/**
 * Internal: Reverse a pairwise debt WITHOUT touching UserDebt.
 */
async function _reversePairwiseDebt(groupId, fromUser, toUser, amount) {
  const existing = await Debt.findOne({
    where: { group_id: groupId, from_user: fromUser, to_user: toUser },
  });

  if (existing) {
    if (existing.amount > amount) {
      existing.amount -= amount;
      await existing.save();
      return;
    } else {
      const remaining = amount - existing.amount;
      await existing.destroy();
      if (remaining === 0) return;
      amount = remaining;
    }
  }

  // Create/update reverse debt
  const reverse = await Debt.findOne({
    where: { group_id: groupId, from_user: toUser, to_user: fromUser },
  });

  if (reverse) {
    reverse.amount += amount;
    await reverse.save();
  } else {
    await Debt.create({
      group_id: groupId,
      from_user: toUser,
      to_user: fromUser,
      amount,
    });
  }
}

/**
 * Process a new simple debt: from_user owes to_user.
 */
async function processNewDebt(groupId, fromUser, toUser, amount) {
  // Step 1: Update UserDebt
  const [fromDebt] = await UserDebt.findOrCreate({
    where: { group_id: groupId, username: fromUser },
    defaults: { net_debt: 0 },
  });
  const [toDebt] = await UserDebt.findOrCreate({
    where: { group_id: groupId, username: toUser },
    defaults: { net_debt: 0 },
  });

  fromDebt.net_debt += amount;
  toDebt.net_debt -= amount;
  await fromDebt.save();
  await toDebt.save();

  // Steps 2-3: Pairwise debt
  await _addPairwiseDebt(groupId, fromUser, toUser, amount);
}

/**
 * Reverse a debt (settlement): from_user pays to_user.
 */
async function reverseDebt(groupId, fromUser, toUser, amount) {
  // Step 1: Update UserDebt (opposite direction)
  const [fromDebt] = await UserDebt.findOrCreate({
    where: { group_id: groupId, username: fromUser },
    defaults: { net_debt: 0 },
  });
  const [toDebt] = await UserDebt.findOrCreate({
    where: { group_id: groupId, username: toUser },
    defaults: { net_debt: 0 },
  });

  fromDebt.net_debt -= amount;
  toDebt.net_debt += amount;
  await fromDebt.save();
  await toDebt.save();

  // Steps 2-3: Reverse pairwise debt
  await _reversePairwiseDebt(groupId, fromUser, toUser, amount);
}

/**
 * Process a multi-payer expense.
 * lendersData: [[username, amount], ...]
 * borrowersData: [[username, amount], ...]
 */
async function processMultiPayerDebt(groupId, lendersData, borrowersData, totalAmount) {
  // Step 1: Update UserDebt for each lender and borrower
  for (const [username, amt] of lendersData) {
    const [ud] = await UserDebt.findOrCreate({
      where: { group_id: groupId, username },
      defaults: { net_debt: 0 },
    });
    ud.net_debt -= amt;
    await ud.save();
  }

  for (const [username, amt] of borrowersData) {
    const [ud] = await UserDebt.findOrCreate({
      where: { group_id: groupId, username },
      defaults: { net_debt: 0 },
    });
    ud.net_debt += amt;
    await ud.save();
  }

  // Step 2: Create proportional pairwise debts
  for (const [borrower, borrowerAmt] of borrowersData) {
    for (const [lender, lenderAmt] of lendersData) {
      if (borrower === lender) continue;
      const pairAmount = Math.round(borrowerAmt * (lenderAmt / totalAmount));
      if (pairAmount > 0) {
        await _addPairwiseDebt(groupId, borrower, lender, pairAmount);
      }
    }
  }
}

/**
 * Reverse a multi-payer expense (for delete/edit).
 */
async function reverseMultiPayerDebt(groupId, lendersData, borrowersData, totalAmount) {
  // Step 1: Reverse UserDebt
  for (const [username, amt] of lendersData) {
    const [ud] = await UserDebt.findOrCreate({
      where: { group_id: groupId, username },
      defaults: { net_debt: 0 },
    });
    ud.net_debt += amt;
    await ud.save();
  }

  for (const [username, amt] of borrowersData) {
    const [ud] = await UserDebt.findOrCreate({
      where: { group_id: groupId, username },
      defaults: { net_debt: 0 },
    });
    ud.net_debt -= amt;
    await ud.save();
  }

  // Step 2: Reverse pairwise debts
  for (const [borrower, borrowerAmt] of borrowersData) {
    for (const [lender, lenderAmt] of lendersData) {
      if (borrower === lender) continue;
      const pairAmount = Math.round(borrowerAmt * (lenderAmt / totalAmount));
      if (pairAmount > 0) {
        await _reversePairwiseDebt(groupId, borrower, lender, pairAmount);
      }
    }
  }
}

/**
 * Greedy Transaction Minimization Algorithm.
 * Regenerates all OptimisedDebt records for a group.
 */
async function simplifyDebts(groupId) {
  const userDebts = await UserDebt.findAll({ where: { group_id: groupId } });

  const debtors = new MinHeap();
  const creditors = new MinHeap();

  for (const ud of userDebts) {
    if (ud.net_debt > 0) {
      debtors.push([ud.net_debt, ud.username]);
    } else if (ud.net_debt < 0) {
      creditors.push([-ud.net_debt, ud.username]);
    }
  }

  // Delete all existing optimised debts
  await OptimisedDebt.destroy({ where: { group_id: groupId } });

  // Greedy matching
  while (debtors.length > 0 && creditors.length > 0) {
    const [debtAmount, debtor] = debtors.pop();
    const [creditAmount, creditor] = creditors.pop();

    const transaction = Math.min(debtAmount, creditAmount);

    await OptimisedDebt.create({
      group_id: groupId,
      from_user: debtor,
      to_user: creditor,
      amount: transaction,
    });

    const debtorRemainder = debtAmount - transaction;
    const creditorRemainder = creditAmount - transaction;

    if (debtorRemainder > 0) {
      debtors.push([debtorRemainder, debtor]);
    }
    if (creditorRemainder > 0) {
      creditors.push([creditorRemainder, creditor]);
    }
  }
}

module.exports = {
  processNewDebt,
  reverseDebt,
  processMultiPayerDebt,
  reverseMultiPayerDebt,
  simplifyDebts,
};
