/**
 * k-d Tree for k-dimensional nearest-neighbor search
 * 
 * Used by the shape-based character converter to find the ASCII character
 * whose precomputed shape vector is closest to a given sampling vector.
 * Provides O(log n) lookups instead of O(n) brute force.
 */

export interface KdNode<T> {
  point: number[];
  data: T;
  left: KdNode<T> | null;
  right: KdNode<T> | null;
  splitDimension: number;
}

export interface NearestResult<T> {
  point: number[];
  data: T;
  distance: number;
}

export class KdTree<T> {
  private root: KdNode<T> | null;
  private dimensions: number;

  constructor(entries: Array<{ point: number[]; data: T }>) {
    if (entries.length === 0) {
      this.root = null;
      this.dimensions = 0;
      return;
    }
    this.dimensions = entries[0].point.length;
    this.root = this.buildTree(entries, 0);
  }

  private buildTree(
    entries: Array<{ point: number[]; data: T }>,
    depth: number
  ): KdNode<T> | null {
    if (entries.length === 0) return null;

    const dim = depth % this.dimensions;

    // Sort by the current splitting dimension
    entries.sort((a, b) => a.point[dim] - b.point[dim]);

    const medianIndex = Math.floor(entries.length / 2);
    const median = entries[medianIndex];

    return {
      point: median.point,
      data: median.data,
      splitDimension: dim,
      left: this.buildTree(entries.slice(0, medianIndex), depth + 1),
      right: this.buildTree(entries.slice(medianIndex + 1), depth + 1),
    };
  }

  /**
   * Find the nearest neighbor to the query point.
   * Returns the closest point, its associated data, and the squared distance.
   */
  findNearest(query: number[]): NearestResult<T> | null {
    if (!this.root) return null;

    let bestNode: KdNode<T> = this.root;
    let bestDistSq = this.squaredDistance(query, this.root.point);

    const search = (node: KdNode<T> | null) => {
      if (!node) return;

      const distSq = this.squaredDistance(query, node.point);
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestNode = node;
      }

      const dim = node.splitDimension;
      const diff = query[dim] - node.point[dim];
      const diffSq = diff * diff;

      // Search the side of the split that the query point falls on first
      const first = diff < 0 ? node.left : node.right;
      const second = diff < 0 ? node.right : node.left;

      search(first);

      // Only search the other side if the splitting plane is closer than the best distance
      if (diffSq < bestDistSq) {
        search(second);
      }
    };

    search(this.root);

    return {
      point: bestNode.point,
      data: bestNode.data,
      distance: bestDistSq, // squared distance (caller can sqrt if needed)
    };
  }

  private squaredDistance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return sum;
  }
}
